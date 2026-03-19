import "server-only";

import { prisma } from "../prisma";
import { env } from "../env";
import { log } from "../logger";
import { notifyPaymentSucceeded } from "../whatsapp";
import { maybeSendSubscriptionReceipt } from "../subscription-receipt";
import { recordInvoicePayment } from "../invoice-payments";
import type { BillingInterval } from "../pricing";
import { finalizeSubscriptionPayment } from "./subscription";

const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

export function normalizeFlutterwavePaymentMethod(data: any) {
  const raw = String(data?.payment_type || data?.payment_type || "").toLowerCase();
  if (raw.includes("bank") || raw.includes("transfer")) return "Bank transfer";
  if (raw.includes("ussd")) return "USSD";
  if (raw.includes("mobile") || raw.includes("wallet")) return "Wallet";
  if (raw.includes("card") || raw.includes("visa") || raw.includes("master")) return "Card";
  return "Card";
}

function normalizeInterval(value: unknown): BillingInterval {
  return String(value || "").toLowerCase() === "yearly" ? "yearly" : "monthly";
}

export async function initializeFlutterwavePayment({
  amount,
  currency,
  email,
  name,
  txRef,
  redirectUrl,
  metadata,
  subaccountId,
}: {
  amount: number;
  currency: string;
  email: string;
  name?: string;
  txRef: string;
  redirectUrl: string;
  metadata?: Record<string, unknown>;
  subaccountId?: string;
}) {
  const res = await fetch(`${FLUTTERWAVE_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.flutterwaveSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: txRef,
      amount,
      currency,
      redirect_url: redirectUrl,
      customer: { email, name },
      meta: metadata,
      ...(subaccountId ? { subaccounts: [{ id: subaccountId }] } : {}),
      customizations: {
        title: "Maboria",
        description: "Maboria subscription",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Flutterwave init failed: ${err}`);
  }

  return res.json();
}

export function verifyFlutterwaveWebhook(signature: string | undefined) {
  const secret = env.flutterwaveWebhookSecret;
  if (!secret) {
    log("warn", "flutterwave_webhook_secret_missing");
    return process.env.NODE_ENV !== "production";
  }
  if (!signature) return false;
  return signature === secret;
}

export async function verifyFlutterwaveTransaction(transactionId: number | string) {
  const res = await fetch(`${FLUTTERWAVE_BASE}/transactions/${transactionId}/verify`, {
    headers: { Authorization: `Bearer ${env.flutterwaveSecret}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Flutterwave verify failed: ${err}`);
  }
  return res.json();
}

export async function verifyFlutterwaveTransactionByReference(txRef: string) {
  const res = await fetch(
    `${FLUTTERWAVE_BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
    {
      headers: { Authorization: `Bearer ${env.flutterwaveSecret}` },
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Flutterwave verify by reference failed: ${err}`);
  }
  return res.json();
}

export async function createFlutterwaveRefund({
  transactionId,
  amount,
  comments,
}: {
  transactionId: string | number;
  amount?: number | null;
  comments?: string | null;
}) {
  const body: Record<string, unknown> = {};
  if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
    body.amount = amount;
  }
  if (comments) {
    body.comments = comments;
  }

  const res = await fetch(`${FLUTTERWAVE_BASE}/transactions/${encodeURIComponent(String(transactionId))}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.flutterwaveSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Flutterwave refund failed: ${err}`);
  }

  return res.json();
}

export async function listFlutterwaveBanks(country: string) {
  const res = await fetch(`${FLUTTERWAVE_BASE}/banks/${encodeURIComponent(country)}`, {
    headers: { Authorization: `Bearer ${env.flutterwaveSecret}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Flutterwave bank list failed: ${err}`);
  }
  return res.json();
}

export async function listFlutterwaveBankBranches(bankId: string | number) {
  const res = await fetch(`${FLUTTERWAVE_BASE}/banks/${encodeURIComponent(String(bankId))}/branches`, {
    headers: { Authorization: `Bearer ${env.flutterwaveSecret}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Flutterwave branch list failed: ${err}`);
  }
  return res.json();
}

export async function createFlutterwaveSubaccount({
  businessName,
  businessEmail,
  accountName,
  accountNumber,
  bankCode,
  country,
  phone,
  payoutType,
  iban,
  bicSwift,
  currency,
  payoutDetails,
}: {
  businessName: string;
  businessEmail: string;
  accountName: string;
  accountNumber?: string | null;
  bankCode?: string | null;
  country: string;
  phone: string;
  payoutType?: "local" | "sepa";
  iban?: string | null;
  bicSwift?: string | null;
  currency?: string | null;
  payoutDetails?: {
    branchCode?: string | null;
    routingNumber?: string | null;
    sortCode?: string | null;
  };
}) {
  const isSepa = payoutType === "sepa";
  const meta = [
    ...(bicSwift ? [{ meta_name: "swiftCode", meta_value: bicSwift }] : []),
    ...(payoutDetails?.routingNumber
      ? [{ meta_name: "routingNumber", meta_value: payoutDetails.routingNumber }]
      : []),
    ...(payoutDetails?.branchCode
      ? [{ meta_name: "bank_branch", meta_value: payoutDetails.branchCode }]
      : []),
    ...(payoutDetails?.sortCode
      ? [{ meta_name: "sortCode", meta_value: payoutDetails.sortCode }]
      : []),
  ];
  const res = await fetch(`${FLUTTERWAVE_BASE}/subaccounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.flutterwaveSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      account_bank: isSepa ? "IBAN" : bankCode,
      account_number: isSepa ? iban : accountNumber,
      business_name: businessName,
      business_email: businessEmail,
      business_contact: accountName,
      business_contact_mobile: phone,
      country,
      ...(currency ? { currency } : {}),
      ...(meta.length ? { meta } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Flutterwave subaccount failed: ${err}`);
  }

  return res.json();
}

export async function recordFlutterwavePayment(data: any) {
  const userId = data?.meta?.userId as string | undefined;
  const email = data?.customer?.email as string | undefined;
  const reference = (data?.tx_ref as string | undefined) || (data?.id ? String(data.id) : undefined);
  if (!reference) return;
  if (data?.meta?.type === "invoice_payment") {
    const isVerified = data?.meta?.verified === true;
    if (!isVerified) {
      log("warn", "flutterwave_invoice_payment_unverified", { reference });
      return;
    }
    const amount = typeof data.amount === "number" ? data.amount : Number(data.amount || 0);
    const currency = (data.currency || "NGN").toUpperCase();
    const status = data.status === "successful" ? "SUCCEEDED" : "FAILED";
    const meta = data?.meta || {};
    await recordInvoicePayment({
      provider: "FLUTTERWAVE",
      reference,
      amount,
      currency,
      status,
      invoiceId: meta?.invoice_id || meta?.invoiceId,
      invoiceNumber: meta?.invoiceNumber,
      userId: meta?.user_id || meta?.userId || userId,
      organizationId: meta?.organization_id || meta?.organizationId,
      verified: true,
      verifiedAt: data?.paid_at || data?.charged_at || data?.created_at,
      rawPayload: data,
    });
    return;
  }

  let resolvedUserId = userId;
  if (!resolvedUserId && email) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    resolvedUserId = user?.id;
  }
  if (!resolvedUserId) {
    log("warn", "flutterwave_payment_missing_user", { reference, email });
    return;
  }

  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount || 0);
  const currency = (data.currency || "NGN").toUpperCase();
  const status = data.status === "successful" ? "SUCCEEDED" : "FAILED";
  const plan = data?.meta?.plan as string | undefined;
  const interval = normalizeInterval(data?.meta?.interval);
  const paymentMethod = data?.meta?.paymentMethod || normalizeFlutterwavePaymentMethod(data);
  const verified = data?.meta?.verified === true;
  if (status === "SUCCEEDED" && verified) {
    const finalized = await finalizeSubscriptionPayment({
      provider: "FLUTTERWAVE",
      reference,
      amount,
      currency,
      userId: resolvedUserId,
      plan,
      interval,
      paymentMethod,
      verifiedAt: data?.paid_at || data?.charged_at || data?.created_at,
      rawPayload: data,
    });
    if (!finalized?.payment) {
      return;
    }
    try {
      await maybeSendSubscriptionReceipt({
        paymentId: finalized.payment.id,
        userId: resolvedUserId,
        amount,
        currency,
        provider: "FLUTTERWAVE",
        reference,
        paidAt: finalized.payment.createdAt,
        plan: finalized.plan,
        interval: finalized.interval,
        paymentMethod,
        verified,
      });
    } catch (error: any) {
      log("error", "flutterwave_receipt_failed", { userId: resolvedUserId, reference, error: error.message });
    }
    try {
      await notifyPaymentSucceeded({
        userId: resolvedUserId,
        provider: "FLUTTERWAVE",
        amount,
        currency,
        reference,
      });
    } catch (error: any) {
      log("error", "flutterwave_whatsapp_failed", { userId, reference, error: error.message });
    }
    return;
  }

  const existing = await prisma.payment.findFirst({ where: { reference } });
  if (existing) {
    return;
  }

  await prisma.payment.create({
    data: {
      userId: resolvedUserId,
      amount,
      currency,
      provider: "FLUTTERWAVE",
      status,
      reference,
      metadata: {
        ...(data?.meta || {}),
        userId: resolvedUserId,
        plan,
        interval,
        paymentMethod,
        verified,
      },
    },
  });

  log("info", "Flutterwave payment recorded", { userId: resolvedUserId, amount, currency, reference });
}
