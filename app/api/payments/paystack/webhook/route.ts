import { NextResponse } from "next/server";
import {
  verifyPaystackWebhook,
  verifyPaystackTransaction,
  recordPaystackPayment,
} from "@/lib/payments/paystack";
import { recordInvoicePayment } from "@/lib/invoice-payments";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { createAdminNotification } from "@/lib/notifications";
import { subscriptionPlanToUserPlan } from "@/lib/entitlements";
import {
  beginWebhookEvent,
  hashWebhookPayload,
  markWebhookFailed,
  markWebhookProcessed,
} from "@/lib/webhook-events";
import { fromMinorUnits, normalizeCurrency } from "@/lib/payments/currency-allowlist";

export const POST = withErrorHandling(async (req: Request) => {
  const signature = req.headers.get("x-paystack-signature") || undefined;
  const body = await req.text();
  const payloadHash = hashWebhookPayload(body);
  const valid = verifyPaystackWebhook(signature, body);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const payload = JSON.parse(body);
  const event = payload.event as string | undefined;
  const data = payload.data;
  log("info", "paystack_webhook_received", { event });
  const userIdFromMeta = data?.metadata?.userId as string | undefined;
  const isInvoicePayment = data?.metadata?.type === "invoice_payment";

  const eventId = String(data?.id || data?.reference || `${event}:${payloadHash}`);
  const webhookEvent = await beginWebhookEvent({
    provider: "PAYSTACK",
    eventId,
    payloadHash,
  });
  if (webhookEvent.duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    if (isInvoicePayment) {
      const reference = data?.reference as string | undefined;
      if (!reference) {
        await markWebhookFailed(webhookEvent.id, "Missing invoice reference");
        return NextResponse.json({ error: "Missing invoice reference" }, { status: 400 });
      }
      const verification = await verifyPaystackTransaction(reference);
      const verified = verification?.data;
      if (!verification?.status || !verified) {
        await markWebhookFailed(webhookEvent.id, "Verification failed");
        return NextResponse.json({ error: "Verification failed" }, { status: 400 });
      }
      if (verified?.status !== "success") {
        await markWebhookFailed(webhookEvent.id, "Payment not successful");
        return NextResponse.json({ error: "Payment not successful" }, { status: 400 });
      }
      const meta = verified?.metadata || {};
      if (meta?.type !== "invoice_payment") {
        await markWebhookProcessed(webhookEvent.id);
        return NextResponse.json({ received: true, ignored: true });
      }
      await recordInvoicePayment({
        provider: "PAYSTACK",
        reference: verified.reference || reference,
        amount: fromMinorUnits(Number(verified.amount || 0), verified.currency || "NGN"),
        currency: normalizeCurrency(verified.currency || "NGN"),
        status: "SUCCEEDED",
        invoiceId: meta?.invoice_id || meta?.invoiceId,
        invoiceNumber: meta?.invoiceNumber,
        userId: meta?.user_id || meta?.userId,
        organizationId: meta?.organization_id || meta?.organizationId,
        verified: true,
        verifiedAt: verified?.paid_at || verified?.paidAt || verified?.transaction_date,
        rawPayload: verified,
      });
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, invoice: true });
    }

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
      const currency = normalizeCurrency(data?.currency || "NGN");
      let subscriptionId: string | null = null;
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userIdFromMeta}))`;
        const existingForPlan = await tx.subscription.findFirst({
          where: { userId: userIdFromMeta, plan: data.metadata.plan },
          orderBy: { createdAt: "desc" },
        });
        if (existingForPlan) {
          await tx.subscription.update({
            where: { id: existingForPlan.id },
            data: { status: "ACTIVE", renewalDate, currency },
          });
          subscriptionId = existingForPlan.id;
        } else {
          const created = await tx.subscription.create({
            data: {
              userId: userIdFromMeta,
              plan: data.metadata.plan,
              status: "ACTIVE",
              renewalDate,
              currency,
              interval: "monthly",
            },
          });
          subscriptionId = created.id;
        }
      });
      log("info", "paystack_subscription_synced", {
        userId: userIdFromMeta,
        plan: data.metadata.plan,
        status: "ACTIVE",
      });
      const newPlan = subscriptionPlanToUserPlan(data.metadata.plan);
      if (subscriptionId) {
        await prisma.activityLog.create({
          data: {
            userId: userIdFromMeta,
            action: "SUBSCRIPTION_UPDATED",
            resourceType: "subscription",
            resourceId: subscriptionId,
            metadata: { status: "ACTIVE", plan: data.metadata.plan },
          },
        });
      }
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
      await prisma.activityLog.create({
        data: {
          userId,
          action: "SUBSCRIPTION_CANCELED",
          resourceType: "subscription",
          resourceId: existing?.id ?? undefined,
          metadata: { event, status: "CANCELED" },
        },
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
        const currency = normalizeCurrency(data?.currency || "NGN");
      await prisma.subscription.upsert({
        where: { id: data?.subscription_code || data?.id || `${userId}-${plan}` },
        update: { status: "ACTIVE", plan, renewalDate, currency },
        create: {
          id: data?.subscription_code || data?.id || `${userId}-${plan}`,
          userId,
          plan,
          status: "ACTIVE",
          renewalDate,
          currency,
          interval: "monthly",
        },
      });
      await prisma.activityLog.create({
        data: {
          userId,
          action: "SUBSCRIPTION_UPDATED",
          resourceType: "subscription",
          resourceId: data?.subscription_code || data?.id || `${userId}-${plan}`,
          metadata: { status: "ACTIVE", plan, event },
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
    await markWebhookProcessed(webhookEvent.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await markWebhookFailed(webhookEvent.id, error instanceof Error ? error.message : "unknown_error");
    throw error;
  }
});

export const dynamic = "force-dynamic";
