import "server-only";

import { prisma } from "../prisma";
import { env } from "../env";
import { log } from "../logger";

const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

export async function initializeFlutterwavePayment({
  amount,
  currency,
  email,
  name,
  txRef,
  redirectUrl,
  metadata,
}: {
  amount: number;
  currency: string;
  email: string;
  name?: string;
  txRef: string;
  redirectUrl: string;
  metadata?: Record<string, unknown>;
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

export async function recordFlutterwavePayment(data: any) {
  const userId = data?.meta?.userId as string | undefined;
  const reference = (data?.tx_ref as string | undefined) || (data?.id ? String(data.id) : undefined);
  if (!userId || !reference) return;

  const existing = await prisma.payment.findFirst({ where: { reference } });
  if (existing) return;

  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount || 0);
  const currency = (data.currency || "NGN").toUpperCase();
  const status = data.status === "successful" ? "SUCCEEDED" : "FAILED";

  await prisma.payment.create({
    data: {
      userId,
      amount,
      currency,
      provider: "FLUTTERWAVE",
      status,
      reference,
      metadata: data,
    },
  });

  log("info", "Flutterwave payment recorded", { userId, amount, currency, reference });
}
