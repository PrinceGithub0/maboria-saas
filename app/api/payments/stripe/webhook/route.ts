import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { fromMinorUnits, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { verifyStripeWebhookSignature } from "@/lib/payments/stripe";
import { finalizeSubscriptionPayment } from "@/lib/payments/subscription";

export const POST = withErrorHandling(async (req: Request) => {
  const rawBody = await req.text();
  verifyStripeWebhookSignature(rawBody, req.headers.get("stripe-signature"));

  const payload = JSON.parse(rawBody);
  const eventType = String(payload?.type || "");
  const eventObject = payload?.data?.object || {};

  await prisma.webhookEvent.upsert({
    where: {
      provider_eventId: {
        provider: "stripe",
        eventId: String(payload?.id || `${eventType}:${eventObject?.id || "unknown"}`),
      },
    },
    create: {
      provider: "stripe",
      eventId: String(payload?.id || `${eventType}:${eventObject?.id || "unknown"}`),
      payloadHash: String(payload?.id || `${eventType}:${eventObject?.id || "unknown"}`),
      status: "RECEIVED",
    },
    update: {
      processedAt: null,
      status: "RECEIVED",
      error: null,
    },
  });

  if (eventType === "checkout.session.expired") {
    const reference = String(eventObject?.client_reference_id || "");
    if (reference) {
      await prisma.checkoutSession.updateMany({
        where: { reference },
        data: { status: "ABANDONED" },
      });
    }
    return NextResponse.json({ received: true });
  }

  if (eventType !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const reference = String(eventObject?.client_reference_id || eventObject?.id || "").trim();
  const metadata = (eventObject?.metadata || {}) as Record<string, unknown>;
  const userId = String(metadata.userId || "").trim();
  const plan = String(metadata.plan || "").trim();
  const interval = String(metadata.interval || "monthly").trim();
  const currency = normalizeCurrency(String(eventObject?.currency || metadata.currency || "USD"));
  const amount = fromMinorUnits(Number(eventObject?.amount_total || 0), currency);

  if (!reference || !userId || !plan || amount <= 0) {
    return NextResponse.json({ error: "Missing Stripe checkout metadata." }, { status: 400 });
  }

  await prisma.checkoutSession.updateMany({
    where: { reference },
    data: {
      status: "SUCCESS",
      providerPayload: payload,
    },
  });

  await finalizeSubscriptionPayment({
    provider: "STRIPE",
    reference,
    amount,
    currency,
    userId,
    plan,
    interval,
    paymentMethod: String(eventObject?.payment_method_types?.[0] || "stripe_checkout"),
    verifiedAt: new Date(),
    rawPayload: payload,
  });

  const business = await prisma.business.findFirst({
    where: { ownerId: userId },
    select: { id: true, orgSubscription: { select: { id: true } } },
  });

  if (business?.orgSubscription?.id) {
    await prisma.orgSubscription.update({
      where: { orgId: business.id },
      data: {
        provider: "STRIPE",
        providerCustomerId: String(eventObject?.customer || "") || null,
        providerSubscriptionId: String(eventObject?.subscription || "") || null,
      },
    });
  }

  await prisma.webhookEvent.updateMany({
    where: {
      provider: "stripe",
      eventId: String(payload?.id || `${eventType}:${eventObject?.id || "unknown"}`),
    },
    data: {
      processedAt: new Date(),
      status: "PROCESSED",
      error: null,
    },
  });

  return NextResponse.json({ received: true });
});

export const dynamic = "force-dynamic";
