import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { log } from "@/lib/logger";
import { recordFlutterwavePayment } from "@/lib/payments/flutterwave";
import { pricingTableDualCurrency } from "@/lib/pricing";
import {
  beginWebhookEvent,
  hashWebhookPayload,
  markWebhookFailed,
  markWebhookProcessed,
} from "@/lib/webhook-events";
import { getUserPlan, subscriptionPlanToUserPlan } from "@/lib/entitlements";
import { isAllowedCurrency, isProviderCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";

export const POST = withErrorHandling(async (req: Request) => {
  const secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET || "";
  const signature = req.headers.get("verif-hash") || "";
  const rawBody = await req.text();
  const payloadHash = hashWebhookPayload(rawBody);
  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!secret || signature !== secret) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = payload?.event;
  const data = payload?.data || {};
  const status = data?.status;
  const txRef = data?.tx_ref as string | undefined;

  log("info", "flutterwave_webhook_event", { event, txRef, status });

  const eventId = String(data?.id || txRef || `${event}:${payloadHash}`);
  const webhookEvent = await beginWebhookEvent({
    provider: "FLUTTERWAVE",
    eventId,
    payloadHash,
  });
  if (webhookEvent.duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    if (event !== "charge.completed" || status !== "successful") {
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, ignored: true });
    }

    const amount = typeof data?.amount === "number" ? data.amount : Number(data?.amount || 0);
    const currency = normalizeCurrency(data?.currency || "USD");
    const userId = data?.meta?.userId as string | undefined;
    const plan = data?.meta?.plan as string | undefined;

    if (!txRef || !userId || !plan) {
      await markWebhookFailed(webhookEvent.id, "Missing payment metadata");
      return NextResponse.json({ error: "Missing payment metadata" }, { status: 400 });
    }

    const existingPayment = await prisma.payment.findFirst({ where: { reference: txRef } });
    if (existingPayment) {
      log("info", "flutterwave_webhook_duplicate", { txRef, userId });
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (!isAllowedCurrency(currency) || !isProviderCurrency("FLUTTERWAVE", currency)) {
      log("warn", "flutterwave_currency_unsupported", { userId, txRef, currency });
      await prisma.payment.create({
        data: {
          userId,
          amount,
          currency,
          provider: "FLUTTERWAVE",
          status: "FAILED",
          reference: txRef,
          metadata: { ...data, needsReview: true, reason: "unsupported_currency" },
        },
      });
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, needsReview: true });
    }

    const priceTable = pricingTableDualCurrency();
    const planRow =
      plan === "GROWTH" ? priceTable.find((p) => p.plan === "GROWTH") : priceTable.find((p) => p.plan === "STARTER");
    const expected = currency === "NGN" ? planRow?.ngn : planRow?.usd;
    if (expected == null || amount !== expected) {
      log("warn", "flutterwave_amount_mismatch", { userId, txRef, currency, amount, expected });
      await markWebhookFailed(webhookEvent.id, "Amount verification failed");
      return NextResponse.json({ error: "Amount verification failed" }, { status: 400 });
    }

    const oldPlan = await getUserPlan(userId);
    await recordFlutterwavePayment({ ...data, meta: data?.meta });

    const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    let subscriptionId: string | null = null;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const existingForPlan = await tx.subscription.findFirst({
        where: { userId, plan },
        orderBy: { createdAt: "desc" },
      });
      if (existingForPlan) {
        await tx.subscription.update({
          where: { id: existingForPlan.id },
          data: { status: "ACTIVE", renewalDate },
        });
        subscriptionId = existingForPlan.id;
      } else {
        const created = await tx.subscription.create({
          data: {
            userId,
            plan,
            status: "ACTIVE",
            renewalDate,
            currency: currency === "NGN" ? "NGN" : "USD",
            interval: "monthly",
          },
        });
        subscriptionId = created.id;
      }
    });

    const newPlan = subscriptionPlanToUserPlan(plan);
    if (subscriptionId) {
      await prisma.activityLog.create({
        data: {
          userId,
          action: "SUBSCRIPTION_UPDATED",
          resourceType: "subscription",
          resourceId: subscriptionId,
          metadata: { status: "ACTIVE", plan },
        },
      });
    }
    log("info", "billing_plan_transition", {
      provider: "flutterwave",
      event,
      userId,
      oldPlan,
      newPlan,
    });
    log("info", "flutterwave_webhook_processed", { txRef, userId, plan });
    await markWebhookProcessed(webhookEvent.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await markWebhookFailed(webhookEvent.id, error instanceof Error ? error.message : "unknown_error");
    throw error;
  }
});

export const dynamic = "force-dynamic";
