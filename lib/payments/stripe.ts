import Stripe from "stripe";
import { prisma } from "../prisma";
import { log } from "../logger";
import { env } from "../env";

const stripe = new Stripe(env.stripeKey, {
  apiVersion: "2025-11-17.clover",
});

export async function createStripeCheckoutSession({
  userId,
  priceId,
  successUrl,
  cancelUrl,
  currency = "USD",
}: {
  userId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  currency?: string;
}) {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: (
      await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    )?.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId },
    currency,
  });

  return session;
}

export function verifyStripeWebhook(signature: string | string[] | undefined, payload: string) {
  const secret = env.stripeWebhookSecret;
  if (!secret || !signature) {
    throw new Error("Missing Stripe webhook secret or signature");
  }
  return stripe.webhooks.constructEvent(payload, signature as string, secret);
}

export async function createStripeBillingPortal(customerId: string, returnUrl: string) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

export async function recordStripePayment(event: Stripe.Event) {
  if (event.type !== "checkout.session.completed") return;
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.userId;
  if (!userId) return;

  const amount = session.amount_total || 0;
  const currency = session.currency?.toUpperCase() || "USD";

  await prisma.payment.create({
    data: {
      userId,
      amount,
      currency,
      provider: "STRIPE",
      status: "SUCCEEDED",
      metadata: { sessionId: session.id },
      reference: session.id,
    },
  });

  log("info", "Stripe payment recorded", { userId, amount, currency });
}
