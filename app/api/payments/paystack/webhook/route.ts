import { NextResponse } from "next/server";
import {
  verifyPaystackWebhook,
  verifyPaystackTransaction,
  recordPaystackPayment,
  normalizePaystackPaymentMethod,
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
import type { BillingInterval } from "@/lib/pricing";
import { buildBillingPeriodWindow as buildPeriodWindow } from "@/lib/payments/subscription-change";

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
  const rawPlan = String(data?.metadata?.plan || "").toUpperCase();
  const normalizedPlan = rawPlan === "PREMIUM" ? "BUSINESS" : rawPlan;
  const isInvoicePayment = data?.metadata?.type === "invoice_payment";
  const rawInterval = String(data?.metadata?.interval || "");
  const interval: BillingInterval = rawInterval === "yearly" ? "yearly" : "monthly";
  let subscriptionPayload = data;

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
        paymentMethod: normalizePaystackPaymentMethod(verified),
      });
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, invoice: true });
    }

    if (event === "charge.success" && !isInvoicePayment) {
      const reference = data?.reference as string | undefined;
      if (!reference) {
        await markWebhookFailed(webhookEvent.id, "Missing reference");
        return NextResponse.json({ error: "Missing reference" }, { status: 400 });
      }
      const verification = await verifyPaystackTransaction(reference);
      const verified = verification?.data;
      if (!verification?.status || !verified || verified?.status !== "success") {
        await markWebhookFailed(webhookEvent.id, "Verification failed");
        return NextResponse.json({ error: "Verification failed" }, { status: 400 });
      }
      subscriptionPayload = verified;

      const verifiedMeta = {
        ...(verified?.metadata || {}),
        userId: userIdFromMeta || verified?.metadata?.userId,
        plan: normalizedPlan || verified?.metadata?.plan,
        interval,
        verified: true,
        paymentMethod: normalizePaystackPaymentMethod(verified),
      };

      await recordPaystackPayment({
        ...verified,
        metadata: verifiedMeta,
      });
    }
    if (event === "charge.success" && userIdFromMeta) {
      const existing = await prisma.subscription.findFirst({
        where: { userId: userIdFromMeta, status: { in: ["ACTIVE", "PAST_DUE", "CANCELED", "INACTIVE"] } },
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

    if (subscriptionPayload.status !== "success") {
      await createAdminNotification("Paystack payment failed");
    }

    if (
      subscriptionPayload.status === "success" &&
      userIdFromMeta &&
      (normalizedPlan === "STARTER" ||
        normalizedPlan === "PRO" ||
        normalizedPlan === "GROWTH" ||
        normalizedPlan === "BUSINESS")
    ) {
      log("info", "paystack_subscription_synced", {
        userId: userIdFromMeta,
        plan: normalizedPlan,
        status: "ACTIVE",
      });
    }

    if (event === "subscription.disable") {
      const userId = userIdFromMeta;
      if (userId) {
        const existing = await prisma.subscription.findFirst({
          where: { userId, status: { in: ["ACTIVE", "PAST_DUE", "CANCELED", "INACTIVE"] } },
          orderBy: { createdAt: "desc" },
        });
        const oldPlan = existing ? subscriptionPlanToUserPlan(existing.plan) : "free";
      await prisma.subscription.updateMany({
        where: { userId, status: { in: ["ACTIVE", "PAST_DUE"] } },
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
      const plan = normalizedPlan;
      if (
        userId &&
        (plan === "STARTER" || plan === "PRO" || plan === "GROWTH" || plan === "BUSINESS" || plan === "ENTERPRISE")
      ) {
        const existing = await prisma.subscription.findFirst({
          where: { userId, status: { in: ["ACTIVE", "PAST_DUE", "CANCELED", "INACTIVE"] } },
          orderBy: { createdAt: "desc" },
        });
        const oldPlan = existing ? subscriptionPlanToUserPlan(existing.plan) : "free";
        const { currentPeriodStart, currentPeriodEnd } = buildPeriodWindow(interval);
        const renewalDate = currentPeriodEnd;
        const currency = normalizeCurrency(data?.currency || "NGN");
      await prisma.subscription.upsert({
        where: { id: data?.subscription_code || data?.id || `${userId}-${plan}` },
        update: {
          status: "ACTIVE",
          plan,
          renewalDate,
          currency,
          interval,
          currentPeriodStart,
          currentPeriodEnd,
        },
        create: {
          id: data?.subscription_code || data?.id || `${userId}-${plan}`,
          userId,
          plan,
          status: "ACTIVE",
          renewalDate,
          currency,
          interval,
          currentPeriodStart,
          currentPeriodEnd,
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
