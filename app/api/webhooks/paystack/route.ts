import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { log } from "@/lib/logger";
import { verifyPaystackWebhook, recordPaystackPayment } from "@/lib/payments/paystack";
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
  const signature = req.headers.get("x-paystack-signature") || "";
  const rawBody = await req.text();
  const payloadHash = hashWebhookPayload(rawBody);
  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const valid = verifyPaystackWebhook(signature || undefined, rawBody);
  const event = payload?.event;
  const data = payload?.data;

  log("info", "paystack_webhook_event", { event, reference: data?.reference, valid });

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const reference = data?.reference as string | undefined;
  const eventId = String(data?.id || reference || `${event}:${payloadHash}`);
  const webhookEvent = await beginWebhookEvent({
    provider: "PAYSTACK",
    eventId,
    payloadHash,
  });
  if (webhookEvent.duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    if (event !== "charge.success") {
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, ignored: true });
    }

    const userId = data?.metadata?.userId as string | undefined;
    const plan = data?.metadata?.plan as string | undefined;
    const currency = normalizeCurrency(data?.currency || "NGN");
    const amountKobo = typeof data?.amount === "number" ? data.amount : Number(data?.amount || 0);

    if (!reference || !userId || !plan) {
      await markWebhookFailed(webhookEvent.id, "Missing payment metadata");
      return NextResponse.json({ error: "Missing payment metadata" }, { status: 400 });
    }

    const existingPayment = await prisma.payment.findFirst({ where: { reference } });
    if (existingPayment) {
      log("info", "paystack_webhook_duplicate", { reference, userId });
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (!isAllowedCurrency(currency) || !isProviderCurrency("PAYSTACK", currency)) {
      log("warn", "paystack_currency_unsupported", { userId, reference, currency });
      await prisma.payment.create({
        data: {
          userId,
          amount: amountKobo / 100,
          currency,
          provider: "PAYSTACK",
          status: "FAILED",
          reference,
          metadata: { ...data, needsReview: true, reason: "unsupported_currency" },
        },
      });
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, needsReview: true });
    }

    const priceTable = pricingTableDualCurrency();
    const planRow =
      plan === "GROWTH" ? priceTable.find((p) => p.plan === "GROWTH") : priceTable.find((p) => p.plan === "STARTER");
    const expectedNgn = planRow?.ngn;
    const expectedKobo = expectedNgn ? expectedNgn * 100 : null;

    if (currency !== "NGN" || expectedKobo == null || amountKobo !== expectedKobo) {
      log("warn", "paystack_amount_mismatch", { userId, reference, currency, amount: amountKobo, expectedKobo });
      await markWebhookFailed(webhookEvent.id, "Amount verification failed");
      return NextResponse.json({ error: "Amount verification failed" }, { status: 400 });
    }

    const oldPlan = await getUserPlan(userId);
    await recordPaystackPayment(data);

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
            currency: "NGN",
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
      provider: "paystack",
      event,
      userId,
      oldPlan,
      newPlan,
    });
    log("info", "paystack_webhook_processed", { reference, userId, plan });
    await markWebhookProcessed(webhookEvent.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await markWebhookFailed(webhookEvent.id, error instanceof Error ? error.message : "unknown_error");
    throw error;
  }
});

export const dynamic = "force-dynamic";
