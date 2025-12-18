import crypto from "crypto";
import { prisma } from "../prisma";
import { log } from "../logger";
import { env } from "../env";

const PAYSTACK_SECRET = env.paystackSecret || "";
const PAYSTACK_BASE = "https://api.paystack.co";

export async function initializePaystackTransaction({
  amount,
  email,
  currency,
  callback_url,
  metadata,
}: {
  amount: number;
  email: string;
  currency: string;
  callback_url: string;
  metadata?: Record<string, unknown>;
}) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount, email, currency, callback_url, metadata }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paystack init failed: ${err}`);
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
  if (!userId) return;

  await prisma.payment.create({
    data: {
      userId,
      amount: data.amount,
      currency: data.currency,
      provider: "PAYSTACK",
      status: data.status === "success" ? "SUCCEEDED" : "FAILED",
      metadata: data,
    },
  });

  log("info", "Paystack payment recorded", { userId, amount: data.amount });
}
