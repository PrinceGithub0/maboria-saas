import { NextResponse } from "next/server";
import {
  recordFlutterwavePayment,
  verifyFlutterwaveTransaction,
  verifyFlutterwaveWebhook,
  normalizeFlutterwavePaymentMethod,
} from "@/lib/payments/flutterwave";
import { recordInvoicePayment } from "@/lib/invoice-payments";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { subscriptionPlanToUserPlan } from "@/lib/entitlements";
import { createAdminNotification } from "@/lib/notifications";
import { getPlanPriceForInterval, type BillingInterval } from "@/lib/pricing";
import {
  beginWebhookEvent,
  hashWebhookPayload,
  markWebhookFailed,
  markWebhookProcessed,
} from "@/lib/webhook-events";

export const POST = withErrorHandling(async (req: Request) => {
  const signature =
    req.headers.get("verif-hash") || req.headers.get("x-flutterwave-signature") || undefined;
  const body = await req.text();
  const payloadHash = hashWebhookPayload(body);
  const valid = verifyFlutterwaveWebhook(signature || undefined);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const payload = JSON.parse(body);
  const event = payload.event as string | undefined;
  const data = payload.data || {};

  log("info", "flutterwave_webhook_received", { event, tx_ref: data?.tx_ref });

  const eventId = String(data?.id || data?.tx_ref || `${event}:${payloadHash}`);
  const webhookEvent = await beginWebhookEvent({
    provider: "FLUTTERWAVE",
    eventId,
    payloadHash,
  });
  if (webhookEvent.duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (!data?.id) {
    await markWebhookProcessed(webhookEvent.id);
    return NextResponse.json({ received: true });
  }

  try {
    const verification = await verifyFlutterwaveTransaction(data.id);
    const verified = verification?.data;
    if (!verified || verification?.status !== "success") {
      log("warn", "flutterwave_verification_failed", { id: data.id, event });
      await markWebhookFailed(webhookEvent.id, "verification_failed");
      return NextResponse.json({ received: true });
    }

    const userId = verified?.meta?.userId as string | undefined;
    const rawPlan = String(verified?.meta?.plan || "").toUpperCase();
    const plan = rawPlan === "PREMIUM" ? "BUSINESS" : rawPlan || undefined;
    const rawInterval = String(verified?.meta?.interval || "");
    const interval: BillingInterval = rawInterval === "yearly" ? "yearly" : "monthly";
    const status = verified?.status;
    const amount = Number(verified?.amount || 0);
    const currency = (verified?.currency || "USD").toUpperCase();
    const txRef = verified?.tx_ref;

    if (verified?.meta?.type === "invoice_payment") {
      const meta = verified?.meta || {};
      await recordInvoicePayment({
        provider: "FLUTTERWAVE",
        reference: verified?.tx_ref || String(verified?.id),
        amount: Number(verified?.amount || 0),
        currency: (verified?.currency || "NGN").toUpperCase(),
        status: verified?.status === "successful" ? "SUCCEEDED" : "FAILED",
        invoiceId: meta?.invoice_id || meta?.invoiceId,
        invoiceNumber: meta?.invoiceNumber,
        userId: meta?.user_id || meta?.userId,
        organizationId: meta?.organization_id || meta?.organizationId,
        verified: true,
        verifiedAt: verified?.charged_at || verified?.created_at,
        rawPayload: verified,
      });
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, invoice: true });
    }

    if (plan) {
      const expected = getPlanPriceForInterval(
        plan as "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "PREMIUM" | "ENTERPRISE",
        currency,
        interval
      );
      if (expected && Math.abs(amount - expected) > 0.01) {
        log("warn", "flutterwave_amount_mismatch", { userId, plan, amount, expected, txRef, interval });
        await markWebhookFailed(webhookEvent.id, "amount_mismatch");
        return NextResponse.json({ received: true });
      }
    }

    if (status === "successful") {
      const verifiedMeta = {
        ...(verified?.meta || data?.meta || {}),
        userId,
        plan,
        interval,
        verified: true,
        paymentMethod: normalizeFlutterwavePaymentMethod(verified),
      };
      await recordFlutterwavePayment({ ...verified, meta: verifiedMeta });
      if (userId) {
        const existing = await prisma.subscription.findFirst({
          where: { userId, status: { in: ["ACTIVE", "PAST_DUE", "CANCELED", "INACTIVE"] } },
          orderBy: { createdAt: "desc" },
        });
        const oldPlan = existing ? subscriptionPlanToUserPlan(existing.plan) : "free";

        if (plan === "STARTER" || plan === "PRO" || plan === "GROWTH" || plan === "BUSINESS") {
          const renewalDate =
            interval === "yearly"
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
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
                data: { status: "ACTIVE", renewalDate, currency, interval, plan },
              });
              subscriptionId = existingForPlan.id;
            } else {
              const created = await tx.subscription.create({
                data: {
                  userId,
                  plan,
                  status: "ACTIVE",
                  renewalDate,
                  currency,
                  interval,
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
          log("info", "flutterwave_subscription_synced", { userId, plan, status: "ACTIVE" });
          log("info", "billing_plan_transition", {
            provider: "flutterwave",
            event: event || "charge.completed",
            userId,
            oldPlan,
            newPlan,
          });
        }
    }
    } else {
      await createAdminNotification("Flutterwave payment failed");
    }

    await markWebhookProcessed(webhookEvent.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await markWebhookFailed(webhookEvent.id, error instanceof Error ? error.message : "unknown_error");
    throw error;
  }
});

export const dynamic = "force-dynamic";
