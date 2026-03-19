import "server-only";

import { prisma } from "./prisma";
import { log } from "./logger";
import {
  isAllowedCurrency,
  isProviderCurrency,
  normalizeCurrency,
  toMinorUnits,
} from "./payments/currency-allowlist";
import { convertToDefaultCurrency } from "./billing/currency-conversion";
import { initializePaystackTransaction } from "./payments/paystack";
import { initializeFlutterwavePayment } from "./payments/flutterwave";
import { env } from "./env";
import { triggerInvoiceStatusAutomations } from "./automation/events";
import { markInvoicePublicLinksUsed } from "./invoice-public-link";
import { maybeCreateInvoiceReceipt } from "./invoice-receipt";
import { logUserActivity } from "./user-activity";
import { emitSystemEvent } from "./system-events";

type InvoicePaymentLink = {
  provider: "PAYSTACK" | "FLUTTERWAVE";
  reference: string;
  paymentUrl: string;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const INVOICE_PAYMENT_LINK_TTL_MS = 1000 * 60 * 30;

const buildInvoiceReference = (invoiceId: string) => {
  const stamp = Date.now().toString(36);
  return `inv_${invoiceId.slice(0, 8)}_${stamp}`;
};

const getInvoiceCustomerEmail = (invoice: any) =>
  invoice?.metadata?.customer?.email ||
  invoice?.metadata?.customerEmail ||
  invoice?.metadata?.customer?.emailAddress ||
  null;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isViaSubaccount(provider: "PAYSTACK" | "FLUTTERWAVE", rawPayload: unknown) {
  const payload = asRecord(rawPayload);
  if (provider === "PAYSTACK") {
    const hasSubaccount = Boolean(payload.subaccount) || Boolean((asRecord(payload.authorization) || {}).subaccount);
    return hasSubaccount;
  }

  return (
    Boolean(payload.subaccount_id) ||
    Boolean(payload.subaccountId) ||
    Boolean((asRecord(payload.meta) || {}).subaccount_id) ||
    Boolean((asRecord(payload.meta) || {}).subaccountId)
  );
}

function getLockedConversion(input: {
  amountOriginal: number;
  currencyOriginal: string;
  defaultCurrency: string;
  rawPayload?: unknown;
}) {
  const payload = asRecord(input.rawPayload);
  const paymentLike = {
    amount: asNumber(payload.amount) ?? undefined,
    currency: String(payload.currency || "").toUpperCase() || undefined,
    originalAmount: asNumber(payload.originalAmount) ?? asNumber(payload.amount_original) ?? undefined,
    originalCurrency:
      String(payload.originalCurrency || payload.currency_original || "").toUpperCase() || undefined,
    amountUsd: asNumber(payload.amountUsd) ?? asNumber(payload.amount_usd) ?? undefined,
    amountNgn: asNumber(payload.amountNgn) ?? asNumber(payload.amount_ngn) ?? undefined,
    metadata: payload,
  };

  return convertToDefaultCurrency({
    amountOriginal: input.amountOriginal,
    currencyOriginal: input.currencyOriginal,
    defaultCurrency: input.defaultCurrency,
    invoicePaymentMetadata: payload,
    payment: paymentLike,
  });
}

export async function ensureInvoicePaymentLink({
  invoice,
  customerName,
  returnUrl,
}: {
  invoice: any;
  customerName?: string | null;
  returnUrl?: string;
}): Promise<InvoicePaymentLink> {
  const metadata = (invoice.metadata as any) || {};
  const organizationId = metadata?.organizationId || invoice.userId;
  const existing = metadata?.payment;

  const currency = normalizeCurrency(invoice.currency || "NGN");
  if (!isAllowedCurrency(currency)) {
    throw new Error("Unsupported invoice currency");
  }
  const amount = roundMoney(Number(invoice.total || 0));
  const existingCreatedAtRaw = String(existing?.createdAt || existing?.requestedAt || "").trim();
  const existingCreatedAt = existingCreatedAtRaw ? new Date(existingCreatedAtRaw) : null;
  const existingStatus = String(existing?.status || "").toUpperCase();
  const existingCurrency = normalizeCurrency(String(existing?.currency || currency));
  const existingAmount = roundMoney(asNumber(existing?.amount) ?? amount);
  const existingIsFresh =
    existingCreatedAt !== null &&
    !Number.isNaN(existingCreatedAt.getTime()) &&
    Date.now() - existingCreatedAt.getTime() < INVOICE_PAYMENT_LINK_TTL_MS;
  const existingReturnUrl = String(existing?.returnUrl || "").trim();
  const existingCanBeReused =
    existing?.paymentUrl &&
    existing?.provider &&
    existing?.reference &&
    existingStatus !== "PAID" &&
    existingStatus !== "FAILED" &&
    existingCurrency === currency &&
    existingAmount === amount &&
    existingIsFresh &&
    (!returnUrl || !existingReturnUrl || existingReturnUrl === returnUrl);
  if (existingCanBeReused) {
    return {
      provider: existing.provider,
      reference: existing.reference,
      paymentUrl: existing.paymentUrl,
    };
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

  if (merchant.currency && normalizeCurrency(merchant.currency) !== currency) {
    const error = new Error("No payout account can settle this invoice currency.");
    (error as any).status = 400;
    throw error;
  }

  if (merchant.payoutType === "SEPA" && currency !== "EUR") {
    const error = new Error("No payout account can settle this invoice currency.");
    (error as any).status = 400;
    throw error;
  }

  let provider: "PAYSTACK" | "FLUTTERWAVE" | null = null;
  if (
    merchant.paystackSubaccountCode &&
    merchant.payoutType !== "SEPA" &&
    isProviderCurrency("PAYSTACK", currency)
  ) {
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
      callback_url: returnUrl || env.appUrl,
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
      redirectUrl: returnUrl || env.appUrl,
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
          createdAt: new Date().toISOString(),
          returnUrl: returnUrl || null,
          amount,
          currency,
          invoiceId: invoice.id,
          userId: invoice.userId,
          organizationId,
        },
      },
    },
  });

  await logUserActivity({
    userId: invoice.userId,
    actorId: invoice.userId,
    eventType: "payment_attempt",
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      provider,
      reference,
    },
  });
  await emitSystemEvent({
    tenantId: typeof organizationId === "string" ? organizationId : null,
    userId: invoice.userId,
    actorId: invoice.userId,
    eventType: "payment_attempt",
    severity: "INFO",
    source: "BILLING",
    entityType: "invoice",
    entityId: invoice.id,
    message: "Invoice payment attempt created.",
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      provider,
      reference,
      amount,
      currency,
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
  paymentMethod,
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
  paymentMethod?: string | null;
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
        invoiceNumber
          ? { metadata: { path: ["invoiceNumberAliases"], array_contains: [invoiceNumber] } }
          : undefined,
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

  const businessProfile = await prisma.businessProfile.findUnique({
    where: { userId: invoice.userId },
    select: { defaultCurrency: true },
  });
  const defaultCurrency = normalizeCurrency(businessProfile?.defaultCurrency || normalizedCurrency);
  const lockedConversion = getLockedConversion({
    amountOriginal: receivedAmount,
    currencyOriginal: normalizedCurrency,
    defaultCurrency,
    rawPayload,
  });
  const viaSubaccount = isViaSubaccount(provider, rawPayload);

  const paidAt = verifiedAt ? new Date(verifiedAt) : new Date();
  const processing = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-payment:${provider}:${reference}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice:${invoice.id}`}))`;

    const lockedInvoice = await tx.invoice.findUnique({
      where: { id: invoice.id },
      select: { id: true, status: true, metadata: true, userId: true, invoiceNumber: true },
    });
    if (!lockedInvoice) {
      return {
        invoicePaymentId: null as string | null,
        transitionedToPaid: false,
        transitionedToFailed: false,
        previousInvoiceStatus: "UNKNOWN",
      };
    }

    const previousInvoiceStatus = String(lockedInvoice.status || "").toUpperCase();
    const payableInvoiceStatuses = new Set(["SENT", "OVERDUE", "FAILED"]);
    const transitionedToPaid = status === "SUCCEEDED" && payableInvoiceStatuses.has(previousInvoiceStatus);
    const transitionedToFailed =
      status === "FAILED" && (previousInvoiceStatus === "SENT" || previousInvoiceStatus === "OVERDUE");
    let invoicePaymentId: string | null = null;

    const existing = await tx.invoicePayment.findFirst({ where: { provider, reference } });
    if (existing) {
      invoicePaymentId = existing.id;
      const existingStatus = String(existing.status || "").toUpperCase();
      const preventDowngrade = existingStatus === "SUCCEEDED" && status === "FAILED";
      if (!preventDowngrade) {
        await tx.invoicePayment.update({
          where: { id: existing.id },
          data: {
            status,
            amount: receivedAmount,
            currency: normalizedCurrency,
            amountOriginal: receivedAmount,
            currencyOriginal: normalizedCurrency,
            amountConverted: status === "SUCCEEDED" ? lockedConversion.amount : null,
            currencyDefault: status === "SUCCEEDED" ? lockedConversion.currency : null,
            fxRateUsed: status === "SUCCEEDED" ? lockedConversion.fxRateUsed : null,
            confirmedAt: status === "SUCCEEDED" ? paidAt : null,
            viaSubaccount,
            isManual: false,
            metadata: {
              ...(asRecord(existing.metadata) || {}),
              ...(asRecord(rawPayload) || {}),
            } as any,
          },
        });
      }
    } else {
      const created = await tx.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          userId: invoice.userId,
          provider,
          status,
          amount: receivedAmount,
          currency: normalizedCurrency,
          amountOriginal: receivedAmount,
          currencyOriginal: normalizedCurrency,
          amountConverted: status === "SUCCEEDED" ? lockedConversion.amount : null,
          currencyDefault: status === "SUCCEEDED" ? lockedConversion.currency : null,
          fxRateUsed: status === "SUCCEEDED" ? lockedConversion.fxRateUsed : null,
          confirmedAt: status === "SUCCEEDED" ? paidAt : null,
          viaSubaccount,
          isManual: false,
          reference,
          metadata: {
            ...(rawPayload || {}),
            verificationStatus: "verified",
            verifiedAt: paidAt.toISOString(),
          },
        },
      });
      invoicePaymentId = created.id;
    }

    const existingPayment = await tx.payment.findFirst({ where: { provider, reference } });
    if (!existingPayment) {
      await tx.payment.create({
        data: {
          userId: invoice.userId,
          provider,
          status,
          amount: receivedAmount,
          currency: normalizedCurrency,
          originalAmount: receivedAmount,
          originalCurrency: normalizedCurrency,
          amountUsd: lockedConversion.currency === "USD" ? lockedConversion.amount : null,
          amountNgn: lockedConversion.currency === "NGN" ? lockedConversion.amount : null,
          reference,
          metadata: {
            type: "invoice_payment",
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            userId: invoice.userId,
            organizationId: invoiceOrgId,
            paymentMethod,
            viaSubaccount,
            amount_original: receivedAmount,
            currency_original: normalizedCurrency,
            amount_converted: status === "SUCCEEDED" ? lockedConversion.amount : null,
            currency_default: status === "SUCCEEDED" ? lockedConversion.currency : null,
            fx_rate_used: status === "SUCCEEDED" ? lockedConversion.fxRateUsed : null,
            confirmed_at: status === "SUCCEEDED" ? paidAt.toISOString() : null,
          },
        },
      });
    } else {
      const existingStatus = String(existingPayment.status || "").toUpperCase();
      const preventDowngrade = existingStatus === "SUCCEEDED" && status === "FAILED";
      if (!preventDowngrade && existingPayment.status !== status) {
        await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            status,
            amount: receivedAmount,
            currency: normalizedCurrency,
            originalAmount: receivedAmount,
            originalCurrency: normalizedCurrency,
            amountUsd: lockedConversion.currency === "USD" ? lockedConversion.amount : null,
            amountNgn: lockedConversion.currency === "NGN" ? lockedConversion.amount : null,
            metadata: {
              ...((existingPayment.metadata as any) || {}),
              ...(rawPayload || {}),
              viaSubaccount,
              amount_original: receivedAmount,
              currency_original: normalizedCurrency,
              amount_converted: status === "SUCCEEDED" ? lockedConversion.amount : null,
              currency_default: status === "SUCCEEDED" ? lockedConversion.currency : null,
              fx_rate_used: status === "SUCCEEDED" ? lockedConversion.fxRateUsed : null,
              confirmed_at: status === "SUCCEEDED" ? paidAt.toISOString() : null,
            },
          },
        });
      }
    }

    if (transitionedToPaid) {
      const metadata = (lockedInvoice.metadata as any) || {};
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "PAID",
          lateFeeLocked: true,
          metadata: {
            ...metadata,
            reminders: {
              ...(asRecord(metadata?.reminders) || {}),
              cancelledAt: paidAt.toISOString(),
              reason: "invoice_paid",
            },
            payment: {
              ...(metadata?.payment || {}),
              provider,
              reference,
              status: "PAID",
              amount: receivedAmount,
              currency: normalizedCurrency,
              amountOriginal: receivedAmount,
              currencyOriginal: normalizedCurrency,
              amountConverted: lockedConversion.amount,
              currencyDefault: lockedConversion.currency,
              fxRateUsed: lockedConversion.fxRateUsed,
              paidAt: paidAt.toISOString(),
              verifiedAt: new Date().toISOString(),
              verificationStatus: "verified",
              invoiceId: invoice.id,
              userId: invoice.userId,
              organizationId: invoiceOrgId,
            },
          },
        },
      });
    }

    if (transitionedToFailed) {
      const metadata = (lockedInvoice.metadata as any) || {};
      await tx.invoice.update({
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
    }

    return {
      invoicePaymentId,
      transitionedToPaid,
      transitionedToFailed,
      previousInvoiceStatus,
    };
  });

  if (processing.invoicePaymentId && processing.transitionedToPaid) {
    await markInvoicePublicLinksUsed(invoice.id);
    await maybeCreateInvoiceReceipt({
      invoicePaymentId: processing.invoicePaymentId,
      invoiceId: invoice.id,
      userId: invoice.userId,
      provider,
      reference,
      amount: receivedAmount,
      currency: normalizedCurrency,
      paymentMethod: paymentMethod || undefined,
      paidAt,
      rawPayload,
    });
    triggerInvoiceStatusAutomations({
      userId: invoice.userId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: "PAID",
      provider,
      reference,
      eventId: `${provider}:${reference}:PAID`,
      occurredAt: paidAt,
      source: "payment:webhook-verified",
    }).catch((error) => {
      log("error", "invoice_status_trigger_failed", { invoiceId: invoice.id, error });
    });

    await logUserActivity({
      userId: invoice.userId,
      actorId: invoice.userId,
      eventType: "payment_succeeded",
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        provider,
        reference,
        amount: receivedAmount,
        currency: normalizedCurrency,
      },
    });
    await emitSystemEvent({
      tenantId: typeof invoiceOrgId === "string" ? invoiceOrgId : null,
      userId: invoice.userId,
      actorId: invoice.userId,
      eventType: "payment_succeeded",
      severity: "INFO",
      source: "BILLING",
      entityType: "invoice",
      entityId: invoice.id,
      message: "Invoice payment succeeded.",
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        provider,
        reference,
        amount: receivedAmount,
        currency: normalizedCurrency,
      },
    });

    await logUserActivity({
      userId: invoice.userId,
      actorId: invoice.userId,
      eventType: "invoice_paid",
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        provider,
        reference,
      },
    });
    await emitSystemEvent({
      tenantId: typeof invoiceOrgId === "string" ? invoiceOrgId : null,
      userId: invoice.userId,
      actorId: invoice.userId,
      eventType: "invoice_paid",
      severity: "INFO",
      source: "BILLING",
      entityType: "invoice",
      entityId: invoice.id,
      message: "Invoice marked as paid.",
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        provider,
        reference,
        amount: receivedAmount,
        currency: normalizedCurrency,
      },
    });
  }

  if (processing.transitionedToFailed) {
    triggerInvoiceStatusAutomations({
      userId: invoice.userId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: "FAILED",
      provider,
      reference,
      eventId: `${provider}:${reference}:FAILED`,
      occurredAt: verifiedAt || new Date(),
      source: "payment:webhook-verified",
    }).catch((error) => {
      log("error", "invoice_status_trigger_failed", { invoiceId: invoice.id, error });
    });

    await logUserActivity({
      userId: invoice.userId,
      actorId: invoice.userId,
      eventType: "payment_failed",
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        provider,
        reference,
      },
    });
  }

  if (status === "SUCCEEDED" && processing.previousInvoiceStatus !== "SENT") {
    log("warn", "invoice_payment_invalid_state", {
      invoiceId: invoice.id,
      reference,
      provider,
      status: processing.previousInvoiceStatus,
    });
  }

  log("info", "invoice_payment_recorded", {
    invoiceId: invoice.id,
    reference,
    provider,
    status,
  });
}

export async function recordInvoicePaymentRefund({
  provider,
  reference,
  amount,
  currency,
  occurredAt,
  rawPayload,
}: {
  provider: "PAYSTACK" | "FLUTTERWAVE";
  reference: string;
  amount?: number | null;
  currency?: string | null;
  occurredAt?: Date | string | null;
  rawPayload?: unknown;
}) {
  const original = await prisma.invoicePayment.findFirst({
    where: {
      provider,
      reference,
      status: "SUCCEEDED",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!original) {
    log("warn", "invoice_refund_missing_original_payment", { provider, reference });
    return null;
  }

  const refundReference = `${reference}:refund`;
  const existingRefund = await prisma.invoicePayment.findFirst({
    where: {
      provider,
      reference: refundReference,
      status: "REFUNDED",
    },
    select: { id: true },
  });
  if (existingRefund) {
    return existingRefund;
  }

  const refundAt = occurredAt ? new Date(occurredAt) : new Date();
  const normalizedCurrency = normalizeCurrency(currency || original.currency);
  const originalAmount = Math.abs(Number(original.amountOriginal ?? original.amount ?? 0));
  const requestedAmount = Math.abs(Number(amount ?? originalAmount));
  const refundAmount = originalAmount > 0 ? Math.min(requestedAmount, originalAmount) : requestedAmount;
  const conversionRatio = originalAmount > 0 ? refundAmount / originalAmount : 1;
  const convertedBase = Math.abs(Number(original.amountConverted ?? original.amount ?? 0));
  const refundConverted = Number((convertedBase * conversionRatio).toFixed(2));
  const refundCurrencyDefault = String(original.currencyDefault || normalizedCurrency).toUpperCase();

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-refund:${provider}:${reference}`}))`;

    const duplicate = await tx.invoicePayment.findFirst({
      where: { provider, reference: refundReference },
      select: { id: true },
    });
    if (duplicate) return duplicate;

    const refundRow = await tx.invoicePayment.create({
      data: {
        invoiceId: original.invoiceId,
        userId: original.userId,
        provider,
        status: "REFUNDED",
        amount: -refundAmount,
        currency: normalizedCurrency,
        amountOriginal: -refundAmount,
        currencyOriginal: String(original.currencyOriginal || normalizedCurrency).toUpperCase(),
        fxRateUsed: original.fxRateUsed,
        amountConverted: -refundConverted,
        currencyDefault: refundCurrencyDefault,
        confirmedAt: refundAt,
        viaSubaccount: original.viaSubaccount,
        isManual: false,
        refundOfId: original.id,
        reference: refundReference,
        metadata: {
          type: "invoice_refund",
          originalReference: reference,
          refundedAt: refundAt.toISOString(),
          rawPayload: rawPayload || undefined,
        } as any,
      },
    });

    await tx.payment.create({
      data: {
        userId: original.userId,
        provider,
        status: "REFUNDED",
        amount: -refundAmount,
        currency: normalizedCurrency,
        originalAmount: -refundAmount,
        originalCurrency: String(original.currencyOriginal || normalizedCurrency).toUpperCase(),
        amountUsd: refundCurrencyDefault === "USD" ? -refundConverted : null,
        amountNgn: refundCurrencyDefault === "NGN" ? -refundConverted : null,
        reference: refundReference,
        metadata: {
          type: "invoice_refund",
          originalReference: reference,
          invoiceId: original.invoiceId,
          amount_original: -refundAmount,
          currency_original: String(original.currencyOriginal || normalizedCurrency).toUpperCase(),
          amount_converted: -refundConverted,
          currency_default: refundCurrencyDefault,
          fx_rate_used: original.fxRateUsed ? Number(original.fxRateUsed) : null,
          confirmed_at: refundAt.toISOString(),
          rawPayload: rawPayload || undefined,
        },
      },
    });

    return refundRow;
  });

  log("info", "invoice_payment_refunded", {
    provider,
    reference,
    refundReference,
    invoiceId: original.invoiceId,
    userId: original.userId,
  });

  await emitSystemEvent({
    userId: original.userId,
    actorId: original.userId,
    eventType: "refund_created",
    severity: "INFO",
    source: "BILLING",
    entityType: "invoice",
    entityId: original.invoiceId,
    message: "Invoice refund recorded.",
    metadata: {
      provider,
      reference,
      refundReference,
      invoiceId: original.invoiceId,
      amount: refundAmount,
      currency: normalizedCurrency,
    },
  });

  return created;
}
