import "server-only";

import { prisma } from "../prisma";
import { env } from "../env";
import { log } from "../logger";
import { notifyPaymentSucceeded } from "../whatsapp";
import { maybeSendSubscriptionReceipt } from "../subscription-receipt";
import { recordInvoicePayment } from "../invoice-payments";

const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

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

export async function createFlutterwaveSubaccount({
  businessName,
  businessEmail,
  accountName,
  accountNumber,
  bankCode,
  country,
  phone,
}: {
  businessName: string;
  businessEmail: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
  country: string;
  phone: string;
}) {
  const res = await fetch(`${FLUTTERWAVE_BASE}/subaccounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.flutterwaveSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      account_bank: bankCode,
      account_number: accountNumber,
      business_name: businessName,
      business_email: businessEmail,
      business_contact: accountName,
      business_contact_mobile: phone,
      country,
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

  const existing = await prisma.payment.findFirst({ where: { reference } });
  if (existing) {
    const receiptSentAt = (existing.metadata as any)?.receiptSentAt;
    const plan = (existing.metadata as any)?.plan ?? data?.meta?.plan;
    if (existing.status === "SUCCEEDED" && !receiptSentAt) {
      try {
        await maybeSendSubscriptionReceipt({
          paymentId: existing.id,
          userId: existing.userId,
          amount: Number(existing.amount),
          currency: existing.currency,
          provider: "FLUTTERWAVE",
          reference,
          paidAt: existing.createdAt,
          plan,
        });
      } catch (error: any) {
        log("error", "flutterwave_receipt_failed", { userId, reference, error: error.message });
      }
    }
    return;
  }

  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount || 0);
  const currency = (data.currency || "NGN").toUpperCase();
  const status = data.status === "successful" ? "SUCCEEDED" : "FAILED";
  const plan = data?.meta?.plan as string | undefined;
  const metadata = { ...(data?.meta || {}), userId: resolvedUserId, plan };

  const created = await prisma.payment.create({
    data: {
      userId: resolvedUserId,
      amount,
      currency,
      provider: "FLUTTERWAVE",
      status,
      reference,
      metadata,
    },
  });

  log("info", "Flutterwave payment recorded", { userId: resolvedUserId, amount, currency, reference });
  if (status === "SUCCEEDED") {
    try {
      await maybeSendSubscriptionReceipt({
        paymentId: created.id,
        userId: resolvedUserId,
        amount,
        currency,
        provider: "FLUTTERWAVE",
        reference,
        paidAt: created.createdAt,
        plan,
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
  }
}
