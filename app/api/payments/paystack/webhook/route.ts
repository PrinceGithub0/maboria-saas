import { NextResponse } from "next/server";
import { verifyPaystackWebhook, recordPaystackPayment } from "@/lib/payments/paystack";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { sendTemplateEmail } from "@/lib/email";
import { createAdminNotification } from "@/lib/notifications";
import { subscriptionPlanToUserPlan } from "@/lib/entitlements";

export const POST = withErrorHandling(async (req: Request) => {
  const signature = req.headers.get("x-paystack-signature") || undefined;
  const body = await req.text();
  const valid = verifyPaystackWebhook(signature, body);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const payload = JSON.parse(body);
  const event = payload.event as string | undefined;
  const data = payload.data;
  log("info", "paystack_webhook_received", { event });
  const userIdFromMeta = data?.metadata?.userId as string | undefined;

  await recordPaystackPayment(data);
  if (event === "charge.success" && userIdFromMeta) {
    const existing = await prisma.subscription.findFirst({
      where: { userId: userIdFromMeta, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INACTIVE"] } },
      orderBy: { createdAt: "desc" },
    });
    const oldPlan = existing ? subscriptionPlanToUserPlan(existing.plan) : "free";
    log("info", "billing_plan_transition", {
      provider: "paystack",
      event,
      userId: userIdFromMeta,
      oldPlan,
      newPlan: oldPlan,
    });
  }

  if (userIdFromMeta) {
    const user = await prisma.user.findUnique({ where: { id: userIdFromMeta } });
    if (user) {
      await sendTemplateEmail(
        user.email,
        "Payment received",
        `<p>Your payment was successful for ${data.currency} ${(data.amount / 100).toFixed(2)}. Thank you.</p>`
      );
    }
  }

  if (data.status !== "success") {
    await createAdminNotification("Paystack payment failed");
  }

  // If payment was for a plan purchase, sync/extend subscription (simplified monthly renewal).
  if (
    data.status === "success" &&
    userIdFromMeta &&
    (data.metadata?.plan === "STARTER" || data.metadata?.plan === "GROWTH")
  ) {
    const existing = await prisma.subscription.findFirst({
      where: { userId: userIdFromMeta, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INACTIVE"] } },
      orderBy: { createdAt: "desc" },
    });
    const oldPlan = existing ? subscriptionPlanToUserPlan(existing.plan) : "free";
    const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const existingForPlan = await prisma.subscription.findFirst({
      where: { userId: userIdFromMeta, plan: data.metadata.plan },
      orderBy: { createdAt: "desc" },
    });
    if (existingForPlan) {
      await prisma.subscription.update({
        where: { id: existingForPlan.id },
        data: { status: "ACTIVE", renewalDate },
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId: userIdFromMeta,
          plan: data.metadata.plan,
          status: "ACTIVE",
          renewalDate,
          currency: "NGN",
          interval: "monthly",
        },
      });
    }
    log("info", "paystack_subscription_synced", {
      userId: userIdFromMeta,
      plan: data.metadata.plan,
      status: "ACTIVE",
    });
    const newPlan = subscriptionPlanToUserPlan(data.metadata.plan);
    log("info", "billing_plan_transition", {
      provider: "paystack",
      event: event || "charge.success",
      userId: userIdFromMeta,
      oldPlan,
      newPlan,
    });
  }

  if (event === "subscription.disable") {
    const userId = userIdFromMeta;
    if (userId) {
      const existing = await prisma.subscription.findFirst({
        where: { userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INACTIVE"] } },
        orderBy: { createdAt: "desc" },
      });
      const oldPlan = existing ? subscriptionPlanToUserPlan(existing.plan) : "free";
      await prisma.subscription.updateMany({
        where: { userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
        data: { status: "CANCELED" },
      });
      log("info", "paystack_subscription_status_updated", {
        userId,
        status: "CANCELED",
        event,
      });
      log("info", "billing_plan_transition", {
        provider: "paystack",
        event,
        userId,
        oldPlan,
        newPlan: "free",
      });
    } else {
      log("warn", "Paystack subscription.disable missing userId");
    }
  }

  if (event === "subscription.create" || event === "subscription.enable") {
    const userId = userIdFromMeta;
    const plan = data?.metadata?.plan;
    if (userId && (plan === "STARTER" || plan === "GROWTH" || plan === "ENTERPRISE")) {
      const existing = await prisma.subscription.findFirst({
        where: { userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INACTIVE"] } },
        orderBy: { createdAt: "desc" },
      });
      const oldPlan = existing ? subscriptionPlanToUserPlan(existing.plan) : "free";
      const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await prisma.subscription.upsert({
        where: { id: data?.subscription_code || data?.id || `${userId}-${plan}` },
        update: { status: "ACTIVE", plan, renewalDate },
        create: {
          id: data?.subscription_code || data?.id || `${userId}-${plan}`,
          userId,
          plan,
          status: "ACTIVE",
          renewalDate,
          currency: "NGN",
          interval: "monthly",
        },
      });
      log("info", "paystack_subscription_synced", {
        userId,
        plan,
        status: "ACTIVE",
        event,
      });
      const newPlan = subscriptionPlanToUserPlan(plan);
      log("info", "billing_plan_transition", {
        provider: "paystack",
        event,
        userId,
        oldPlan,
        newPlan,
      });
    } else {
      log("warn", "Paystack subscription event missing metadata", { hasUserId: Boolean(userId), plan });
    }
  }

  if (event === "invoice.create") {
    await prisma.activityLog.create({
      data: { action: "PAYSTACK_INVOICE", metadata: { event, data } },
    });
  }
  return NextResponse.json({ received: true });
});

export const dynamic = "force-dynamic";
