import { NextResponse } from "next/server";
import Stripe from "stripe";
import { verifyStripeWebhook, recordStripePayment } from "@/lib/payments/stripe";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { subscriptionPlanToUserPlan } from "@/lib/entitlements";
import { sendTemplateEmail } from "@/lib/email";
import { createAdminNotification } from "@/lib/notifications";

function stripeStatusToSubscriptionStatus(status: Stripe.Subscription.Status) {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    default:
      return "INACTIVE";
  }
}

function stripePriceIdToPlan(priceId: string | null | undefined) {
  const starter = process.env.STRIPE_PRICE_STARTER || process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER;
  const growth = process.env.STRIPE_PRICE_GROWTH || process.env.NEXT_PUBLIC_STRIPE_PRICE_GROWTH;
  const enterprise = process.env.STRIPE_PRICE_ENTERPRISE || process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE;

  if (!priceId) return null;
  if (starter && priceId === starter) return "STARTER";
  if (growth && priceId === growth) return "GROWTH";
  if (enterprise && priceId === enterprise) return "ENTERPRISE";
  return null;
}

export const POST = withErrorHandling(async (req: Request) => {
  const signature = req.headers.get("stripe-signature") || undefined;
  const payload = await req.text();
  const event = verifyStripeWebhook(signature, payload);
  log("info", "stripe_webhook_received", { type: event.type, id: event.id });

  if (
    event.type === "checkout.session.completed" ||
    event.type === "payment_intent.succeeded" ||
    event.type === "invoice.paid"
  ) {
    const sessionObj = event.data.object as any;
    const userId = sessionObj.metadata?.userId;
    const amount = (sessionObj.amount_total || 0) / 100;
    const currency = sessionObj.currency || "usd";
    if (userId) {
      const existing = await prisma.subscription.findFirst({
        where: { userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
        orderBy: { createdAt: "desc" },
      });
      const oldPlan = existing ? subscriptionPlanToUserPlan(existing.plan) : "free";
      log("info", "billing_plan_transition", {
        provider: "stripe",
        event: event.type,
        userId,
        oldPlan,
        newPlan: oldPlan,
      });
    }
    await recordStripePayment(event);
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        await sendTemplateEmail(
          user.email,
          "Payment received",
          `<p>Your payment was successful for ${currency.toUpperCase()} ${amount.toFixed(2)}. Thank you.</p>`
        );
      }
    }
  } else if (event.type === "invoice.payment_failed" || event.type === "payment_intent.payment_failed") {
    await prisma.activityLog.create({
      data: { action: "STRIPE_PAYMENT_FAILED", metadata: { event: event as any } },
    });
    await createAdminNotification("Stripe payment failed");
    const obj = event.data.object as any;
    const userId = obj.metadata?.userId;
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        await sendTemplateEmail(
          user.email,
          "Payment failed",
          `<p>Your payment could not be processed. Please update your billing details.</p>`
        );
      }
    }
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const userId = (sub.metadata?.userId as string | undefined) || undefined;
    const planFromMeta = stripePriceIdToPlan(sub.items.data?.[0]?.price?.id) || (sub.metadata?.plan as any) || null;
    const status = stripeStatusToSubscriptionStatus(sub.status) as any;
    const renewalDate = new Date(((sub as any).current_period_end || 0) * 1000);
    const existing = userId
      ? await prisma.subscription.findFirst({
          where: { userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INACTIVE"] } },
          orderBy: { createdAt: "desc" },
        })
      : null;
    const oldPlan = existing ? subscriptionPlanToUserPlan(existing.plan) : "free";
    const newPlan =
      status === "CANCELED" || status === "INACTIVE"
        ? "free"
        : planFromMeta
          ? subscriptionPlanToUserPlan(planFromMeta)
          : oldPlan;

    if (userId && planFromMeta) {
      await prisma.subscription.upsert({
        where: { id: sub.id },
        update: {
          plan: planFromMeta,
          status,
          renewalDate,
        },
        create: {
          id: sub.id,
          userId,
          plan: planFromMeta,
          status,
          renewalDate,
        },
      });
      log("info", "stripe_subscription_synced", {
        userId,
        subscriptionId: sub.id,
        plan: planFromMeta,
        status,
      });
      log("info", "billing_plan_transition", {
        provider: "stripe",
        event: event.type,
        userId,
        oldPlan,
        newPlan,
      });
    } else if (userId) {
      await prisma.subscription
        .update({
          where: { id: sub.id },
          data: { status, renewalDate },
        })
        .catch((error) =>
          log("warn", "Stripe subscription status sync skipped", { subscriptionId: sub.id, error: error?.message })
        );
      log("info", "stripe_subscription_status_updated", {
        userId,
        subscriptionId: sub.id,
        status,
      });
      log("info", "billing_plan_transition", {
        provider: "stripe",
        event: event.type,
        userId,
        oldPlan,
        newPlan,
      });
    } else {
      log("warn", "Stripe subscription missing metadata for sync", {
        subscriptionId: sub.id,
        hasUserId: Boolean(userId),
        hasPlan: Boolean(planFromMeta),
      });
    }
  } else {
    log("warn", "Unhandled Stripe event", { type: event.type });
  }

  return NextResponse.json({ received: true });
});

export const dynamic = "force-dynamic";
