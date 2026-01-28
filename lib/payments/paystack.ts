import "server-only";

import crypto from "crypto";
import { prisma } from "../prisma";
import { log } from "../logger";
import { env } from "../env";
import { notifyPaymentSucceeded } from "../whatsapp";
import { maybeSendSubscriptionReceipt } from "../subscription-receipt";
import { recordInvoicePayment } from "../invoice-payments";
import { fromMinorUnits } from "./currency-allowlist";
import type { BillingInterval } from "../pricing";
import { finalizeSubscriptionPayment } from "./subscription";

const PAYSTACK_SECRET = env.paystackSecret || "";
const PAYSTACK_BASE = "https://api.paystack.co";

export function normalizePaystackPaymentMethod(data: any) {
  const channel =
    String(
      data?.authorization?.channel ||
        data?.channel ||
        data?.authorization?.bank ||
        data?.authorization?.card_type ||
        ""
    ).toLowerCase();
  if (channel.includes("bank") || channel.includes("transfer")) return "Bank transfer";
  if (channel.includes("ussd")) return "USSD";
  if (channel.includes("mobile") || channel.includes("wallet")) return "Wallet";
  if (channel.includes("card") || channel.includes("visa") || channel.includes("master")) return "Card";
  return "Card";
}

function normalizeInterval(value: unknown): BillingInterval {
  return String(value || "").toLowerCase() === "yearly" ? "yearly" : "monthly";
}

export async function initializePaystackTransaction({
  amount,
  email,
  currency,
  callback_url,
  reference,
  metadata,
  subaccount,
  bearer,
}: {
  amount: number;
  email: string;
  currency: string;
  callback_url: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  subaccount?: string;
  bearer?: "account" | "subaccount";
}) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      email,
      currency,
      callback_url,
      metadata,
      reference,
      subaccount,
      bearer,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paystack init failed: ${err}`);
  }

  return res.json();
}

export async function verifyPaystackTransaction(reference: string) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paystack verify failed: ${err}`);
  }
  return res.json();
}

export async function listPaystackBanks(currency = "NGN") {
  const res = await fetch(`${PAYSTACK_BASE}/bank?currency=${encodeURIComponent(currency)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paystack bank list failed: ${err}`);
  }
  return res.json();
}

export async function createPaystackSubaccount({
  businessName,
  bankCode,
  accountNumber,
  percentageCharge = 0,
}: {
  businessName: string;
  bankCode: string;
  accountNumber: string;
  percentageCharge?: number;
}) {
  const res = await fetch(`${PAYSTACK_BASE}/subaccount`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      business_name: businessName,
      settlement_bank: bankCode,
      account_number: accountNumber,
      percentage_charge: percentageCharge,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paystack subaccount failed: ${err}`);
  }

  return res.json();
}

export function verifyPaystackWebhook(signature: string | undefined, rawBody: string) {
  if (!signature) throw new Error("Missing Paystack signature");
  const computed = crypto.createHmac("sha512", PAYSTACK_SECRET).update(rawBody).digest("hex");
  return computed === signature;
}

export async function recordPaystackPayment(data: any) {
  const userId = data?.metadata?.userId as string | undefined;
  const email = data?.customer?.email as string | undefined;
  const reference = data?.reference as string | undefined;
  if (!reference) return;
  if (data?.metadata?.type === "invoice_payment") {
    const isVerified = data?.metadata?.verified === true;
    if (!isVerified) {
      log("warn", "paystack_invoice_payment_unverified", { reference });
      return;
    }
    const currency = (data.currency || "NGN").toUpperCase();
    const amount = typeof data.amount === "number" ? fromMinorUnits(data.amount, currency) : 0;
    const status = data.status === "success" ? "SUCCEEDED" : "FAILED";
    const meta = data?.metadata || {};
    await recordInvoicePayment({
      provider: "PAYSTACK",
      reference,
      amount,
      currency,
      status,
      invoiceId: meta?.invoice_id || meta?.invoiceId,
      invoiceNumber: meta?.invoiceNumber,
      userId: meta?.user_id || meta?.userId || userId,
      organizationId: meta?.organization_id || meta?.organizationId,
      verified: true,
      verifiedAt: data?.paid_at || data?.paidAt || data?.transaction_date,
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
    log("warn", "paystack_payment_missing_user", { reference, email });
    return;
  }

  const currency = (data.currency || "NGN").toUpperCase();
  const amount = typeof data.amount === "number" ? fromMinorUnits(data.amount, currency) : 0;
  const status = data.status === "success" ? "SUCCEEDED" : "FAILED";
  const plan = data?.metadata?.plan as string | undefined;
  const interval = normalizeInterval(data?.metadata?.interval);
  const paymentMethod = data?.metadata?.paymentMethod || normalizePaystackPaymentMethod(data);
  const verified = data?.metadata?.verified === true;
  if (status !== "SUCCEEDED" || !verified) {
    log("warn", "paystack_payment_not_verified", { reference, status, verified });
    return;
  }

  const finalized = await finalizeSubscriptionPayment({
    provider: "PAYSTACK",
    reference,
    amount,
    currency,
    userId: resolvedUserId,
    plan,
    interval,
    paymentMethod,
    verifiedAt: data?.paid_at || data?.paidAt || data?.transaction_date,
    rawPayload: data,
  });

  if (!finalized?.payment) return;

  try {
    await maybeSendSubscriptionReceipt({
      paymentId: finalized.payment.id,
      userId: resolvedUserId,
      amount,
      currency,
      provider: "PAYSTACK",
      reference,
      paidAt: finalized.payment.createdAt,
      plan: finalized.plan,
      interval: finalized.interval,
      paymentMethod,
      verified: true,
    });
  } catch (error: any) {
    log("error", "paystack_receipt_failed", { userId: resolvedUserId, reference, error: error.message });
  }
  try {
    await notifyPaymentSucceeded({
      userId: resolvedUserId,
      provider: "PAYSTACK",
      amount,
      currency,
      reference,
    });
  } catch (error: any) {
    log("error", "paystack_whatsapp_failed", { userId: resolvedUserId, reference, error: error.message });
  }
}
