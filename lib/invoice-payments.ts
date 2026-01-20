import "server-only";

import { prisma } from "./prisma";
import { log } from "./logger";
import {
  isAllowedCurrency,
  isProviderCurrency,
  normalizeCurrency,
  toMinorUnits,
} from "./payments/currency-allowlist";
import { initializePaystackTransaction } from "./payments/paystack";
import { initializeFlutterwavePayment } from "./payments/flutterwave";
import { env } from "./env";
import { triggerInvoiceStatusAutomations } from "./automation/events";

type InvoicePaymentLink = {
  provider: "PAYSTACK" | "FLUTTERWAVE";
  reference: string;
  paymentUrl: string;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const buildInvoiceReference = (invoiceId: string) => {
  const stamp = Date.now().toString(36);
  return `inv_${invoiceId.slice(0, 8)}_${stamp}`;
};

const getInvoiceCustomerEmail = (invoice: any) =>
  invoice?.metadata?.customer?.email ||
  invoice?.metadata?.customerEmail ||
  invoice?.metadata?.customer?.emailAddress ||
  null;

export async function ensureInvoicePaymentLink({
  invoice,
  customerName,
}: {
  invoice: any;
  customerName?: string | null;
}): Promise<InvoicePaymentLink> {
  const metadata = (invoice.metadata as any) || {};
  const organizationId = metadata?.organizationId || invoice.userId;
  const existing = metadata?.payment;
  if (existing?.paymentUrl && existing?.provider && existing?.reference) {
    return {
      provider: existing.provider,
      reference: existing.reference,
      paymentUrl: existing.paymentUrl,
    };
  }

  const currency = normalizeCurrency(invoice.currency || "NGN");
  if (!isAllowedCurrency(currency)) {
    throw new Error("Unsupported invoice currency");
  }

  const merchant = await prisma.merchantAccount.findUnique({
    where: { userId: invoice.userId },
  });
  if (!merchant) {
    const error = new Error(
      "Payment setup required. Add your Paystack or Flutterwave subaccount in Settings > Invoice payout setup."
    );
    (error as any).status = 400;
    throw error;
  }

  let provider: "PAYSTACK" | "FLUTTERWAVE" | null = null;
  if (merchant.paystackSubaccountCode && isProviderCurrency("PAYSTACK", currency)) {
    provider = "PAYSTACK";
  } else if (merchant.flutterwaveSubaccountId && isProviderCurrency("FLUTTERWAVE", currency)) {
    provider = "FLUTTERWAVE";
  }

  if (!provider) {
    const error = new Error(
      "Payment setup required. Add your Paystack or Flutterwave subaccount in Settings > Invoice payout setup."
    );
    (error as any).status = 400;
    throw error;
  }

  const reference = buildInvoiceReference(invoice.id);
  const amount = Number(invoice.total || 0);
  const customerEmail = getInvoiceCustomerEmail(invoice);
  if (!customerEmail) {
    const error = new Error("Customer email is required to collect payment.");
    (error as any).status = 400;
    throw error;
  }

  let paymentUrl = "";
  if (provider === "PAYSTACK") {
    const response = await initializePaystackTransaction({
      amount: toMinorUnits(amount, currency),
      email: customerEmail,
      currency,
      callback_url: env.appUrl,
      reference,
      metadata: {
        type: "invoice_payment",
        invoice_id: invoice.id,
        user_id: invoice.userId,
        organization_id: organizationId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        userId: invoice.userId,
        organizationId,
        expectedAmount: amount,
        expectedCurrency: currency,
      },
      subaccount: merchant.paystackSubaccountCode || undefined,
      bearer: "subaccount",
    });
    paymentUrl = response?.data?.authorization_url || response?.data?.link || "";
  } else {
    const response = await initializeFlutterwavePayment({
      amount,
      currency,
      email: customerEmail,
      name: customerName || undefined,
      txRef: reference,
      redirectUrl: env.appUrl,
      metadata: {
        type: "invoice_payment",
        invoice_id: invoice.id,
        user_id: invoice.userId,
        organization_id: organizationId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        userId: invoice.userId,
        organizationId,
        expectedAmount: amount,
        expectedCurrency: currency,
      },
      subaccountId: merchant.flutterwaveSubaccountId || undefined,
    });
    paymentUrl = response?.data?.link || response?.data?.link || "";
  }

  if (!paymentUrl) {
    throw new Error("Failed to create invoice payment link.");
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      metadata: {
        ...metadata,
        invoiceId: invoice.id,
        userId: invoice.userId,
        organizationId,
        payment: {
          provider,
          reference,
          paymentUrl,
          status: "PENDING",
          amount,
          currency,
          invoiceId: invoice.id,
          userId: invoice.userId,
          organizationId,
        },
      },
    },
  });

  log("info", "invoice_payment_link_created", {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    provider,
  });

  return { provider, reference, paymentUrl };
}

export async function recordInvoicePayment({
  provider,
  reference,
  amount,
  currency,
  status,
  invoiceId,
  invoiceNumber,
  userId,
  organizationId,
  verified,
  verifiedAt,
  rawPayload,
}: {
  provider: "PAYSTACK" | "FLUTTERWAVE";
  reference: string;
  amount: number;
  currency: string;
  status: "SUCCEEDED" | "FAILED";
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  verified: boolean;
  verifiedAt?: string | Date | null;
  rawPayload?: any;
}) {
  if (!verified) {
    log("warn", "invoice_payment_unverified", { reference, provider });
    return;
  }
  const invoice = await prisma.invoice.findFirst({
    where: {
      userId: userId || undefined,
      OR: [
        invoiceId ? { id: invoiceId } : undefined,
        invoiceNumber ? { invoiceNumber } : undefined,
      ].filter(Boolean) as any,
    },
  });

  if (!invoice) {
    log("warn", "invoice_payment_missing_invoice", { reference, provider, invoiceId, invoiceNumber });
    return;
  }

  const invoiceMeta = (invoice.metadata as any) || {};
  const invoiceOrgId = invoiceMeta?.organizationId || invoice.userId;
  const expectedOrgId = organizationId || userId;
  if (expectedOrgId && expectedOrgId !== invoiceOrgId) {
    log("warn", "invoice_payment_org_mismatch", {
      reference,
      provider,
      invoiceId: invoice.id,
      expected: invoiceOrgId,
      received: expectedOrgId,
    });
    return;
  }

  const storedPayment = invoiceMeta?.payment;
  if (storedPayment?.reference && storedPayment.reference !== reference) {
    log("warn", "invoice_payment_reference_mismatch", {
      reference,
      provider,
      invoiceId: invoice.id,
      expected: storedPayment.reference,
    });
    return;
  }
  if (storedPayment?.provider && storedPayment.provider !== provider) {
    log("warn", "invoice_payment_provider_mismatch", {
      reference,
      provider,
      invoiceId: invoice.id,
      expected: storedPayment.provider,
    });
    return;
  }

  if (invoice.status === "PAID") {
    log("info", "invoice_payment_already_paid", { invoiceId: invoice.id, reference, provider });
    return;
  }

  const normalizedCurrency = normalizeCurrency(currency);
  const expectedAmount = roundMoney(Number(invoice.total || 0));
  const receivedAmount = roundMoney(Number(amount || 0));
  if (normalizedCurrency !== normalizeCurrency(invoice.currency || "")) {
    log("warn", "invoice_payment_currency_mismatch", {
      reference,
      provider,
      invoiceId: invoice.id,
      expected: invoice.currency,
      received: currency,
    });
    return;
  }

  if (expectedAmount !== receivedAmount) {
    log("warn", "invoice_payment_amount_mismatch", {
      reference,
      provider,
      invoiceId: invoice.id,
      expected: expectedAmount,
      received: receivedAmount,
    });
    return;
  }

  const existing = await prisma.invoicePayment.findFirst({ where: { reference } });
  if (existing) {
    if (existing.status === "SUCCEEDED") {
      return;
    }
    await prisma.invoicePayment.update({
      where: { id: existing.id },
      data: { status, amount, currency: normalizedCurrency, metadata: rawPayload || undefined },
    });
    if (status === "SUCCEEDED" && invoice.status === "SENT") {
      const metadata = (invoice.metadata as any) || {};
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "PAID",
          metadata: {
            ...metadata,
            payment: {
              ...(metadata?.payment || {}),
              provider,
              reference,
              status: "PAID",
              amount: receivedAmount,
              currency: normalizedCurrency,
              paidAt: (verifiedAt ? new Date(verifiedAt) : new Date()).toISOString(),
              verifiedAt: new Date().toISOString(),
              verificationStatus: "verified",
              invoiceId: invoice.id,
              userId: invoice.userId,
              organizationId: invoiceOrgId,
            },
          },
        },
      });
      triggerInvoiceStatusAutomations({
        userId: invoice.userId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: "PAID",
      }).catch((error) => {
        log("error", "invoice_status_trigger_failed", { invoiceId: invoice.id, error });
      });
    } else if (status === "FAILED" && invoice.status === "SENT") {
      const metadata = (invoice.metadata as any) || {};
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "FAILED",
          metadata: {
            ...metadata,
            payment: {
              ...(metadata?.payment || {}),
              provider,
              reference,
              status: "FAILED",
              amount: receivedAmount,
              currency: normalizedCurrency,
              verifiedAt: new Date().toISOString(),
              verificationStatus: "verified",
              invoiceId: invoice.id,
              userId: invoice.userId,
              organizationId: invoiceOrgId,
            },
          },
        },
      });
      triggerInvoiceStatusAutomations({
        userId: invoice.userId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: "FAILED",
      }).catch((error) => {
        log("error", "invoice_status_trigger_failed", { invoiceId: invoice.id, error });
      });
    } else if (status === "SUCCEEDED" && invoice.status !== "SENT") {
      log("warn", "invoice_payment_invalid_state", {
        invoiceId: invoice.id,
        reference,
        provider,
        status: invoice.status,
      });
    }
    log("info", "invoice_payment_updated", {
      invoiceId: invoice.id,
      reference,
      provider,
      status,
    });
    return;
  }

  await prisma.invoicePayment.create({
    data: {
      invoiceId: invoice.id,
      userId: invoice.userId,
      provider,
      status,
      amount: receivedAmount,
      currency: normalizedCurrency,
      reference,
      metadata: {
        ...(rawPayload || {}),
        verificationStatus: "verified",
        verifiedAt: (verifiedAt ? new Date(verifiedAt) : new Date()).toISOString(),
      },
    },
  });

  if (status === "SUCCEEDED" && invoice.status === "SENT") {
    const metadata = (invoice.metadata as any) || {};
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
        metadata: {
          ...metadata,
          payment: {
            ...(metadata?.payment || {}),
            provider,
            reference,
            status: "PAID",
            amount: receivedAmount,
            currency: normalizedCurrency,
            paidAt: (verifiedAt ? new Date(verifiedAt) : new Date()).toISOString(),
            verifiedAt: new Date().toISOString(),
            verificationStatus: "verified",
            invoiceId: invoice.id,
            userId: invoice.userId,
            organizationId: invoiceOrgId,
          },
        },
      },
    });
    triggerInvoiceStatusAutomations({
      userId: invoice.userId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: "PAID",
    }).catch((error) => {
      log("error", "invoice_status_trigger_failed", { invoiceId: invoice.id, error });
    });
  } else if (status === "FAILED" && invoice.status === "SENT") {
    const metadata = (invoice.metadata as any) || {};
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "FAILED",
        metadata: {
          ...metadata,
          payment: {
            ...(metadata?.payment || {}),
            provider,
            reference,
            status: "FAILED",
            amount: receivedAmount,
            currency: normalizedCurrency,
            verifiedAt: new Date().toISOString(),
            verificationStatus: "verified",
            invoiceId: invoice.id,
            userId: invoice.userId,
            organizationId: invoiceOrgId,
          },
        },
      },
    });
    triggerInvoiceStatusAutomations({
      userId: invoice.userId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: "FAILED",
    }).catch((error) => {
      log("error", "invoice_status_trigger_failed", { invoiceId: invoice.id, error });
    });
  } else if (status === "SUCCEEDED" && invoice.status !== "SENT") {
    log("warn", "invoice_payment_invalid_state", {
      invoiceId: invoice.id,
      reference,
      provider,
      status: invoice.status,
    });
  }

  log("info", "invoice_payment_recorded", {
    invoiceId: invoice.id,
    reference,
    provider,
    status,
  });
}
