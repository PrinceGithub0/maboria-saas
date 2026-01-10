import "server-only";

import crypto from "crypto";
import { prisma } from "../prisma";
import { log } from "../logger";
import { env } from "../env";
import { notifyPaymentSucceeded } from "../whatsapp";
import { maybeSendSubscriptionReceipt } from "../subscription-receipt";
import { recordInvoicePayment } from "../invoice-payments";

const PAYSTACK_SECRET = env.paystackSecret || "";
const PAYSTACK_BASE = "https://api.paystack.co";

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
    const amount = typeof data.amount === "number" ? data.amount / 100 : 0;
    const currency = (data.currency || "NGN").toUpperCase();
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

  const existing = await prisma.payment.findFirst({ where: { reference } });
  if (existing) {
    const receiptSentAt = (existing.metadata as any)?.receiptSentAt;
    const plan = (existing.metadata as any)?.plan ?? data?.metadata?.plan;
    if (existing.status === "SUCCEEDED" && !receiptSentAt) {
      try {
        await maybeSendSubscriptionReceipt({
          paymentId: existing.id,
          userId: existing.userId,
          amount: Number(existing.amount),
          currency: existing.currency,
          provider: "PAYSTACK",
          reference,
          paidAt: existing.createdAt,
          plan,
        });
      } catch (error: any) {
        log("error", "paystack_receipt_failed", { userId, reference, error: error.message });
      }
    }
    return;
  }

  const amount = typeof data.amount === "number" ? data.amount / 100 : 0;
  const currency = (data.currency || "NGN").toUpperCase();
  const status = data.status === "success" ? "SUCCEEDED" : "FAILED";
  const plan = data?.metadata?.plan as string | undefined;
  const metadata = { ...(data?.metadata || {}), userId: resolvedUserId, plan };

  const created = await prisma.payment.create({
    data: {
      userId: resolvedUserId,
      amount,
      currency,
      provider: "PAYSTACK",
      status,
      reference,
      metadata,
    },
  });

  log("info", "Paystack payment recorded", { userId: resolvedUserId, amount, currency, reference });
  if (status === "SUCCEEDED") {
    try {
      await maybeSendSubscriptionReceipt({
        paymentId: created.id,
        userId: resolvedUserId,
        amount,
        currency,
        provider: "PAYSTACK",
        reference,
        paidAt: created.createdAt,
        plan,
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
      log("error", "paystack_whatsapp_failed", { userId, reference, error: error.message });
    }
  }
}
