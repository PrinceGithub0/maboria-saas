import { NextResponse } from "next/server";
import {
  recordFlutterwavePayment,
  verifyFlutterwaveTransaction,
  verifyFlutterwaveWebhook,
} from "@/lib/payments/flutterwave";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { subscriptionPlanToUserPlan } from "@/lib/entitlements";
import { sendTemplateEmail } from "@/lib/email";
import { createAdminNotification } from "@/lib/notifications";
import { pricingTableDualCurrency } from "@/lib/pricing";
import { formatCurrency } from "@/lib/currency";
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
    const plan = verified?.meta?.plan as string | undefined;
    const status = verified?.status;
    const amount = Number(verified?.amount || 0);
    const currency = (verified?.currency || "USD").toUpperCase();
    const txRef = verified?.tx_ref;

    if (plan) {
      const priceTable = pricingTableDualCurrency();
      const planRow =
        plan === "GROWTH" ? priceTable.find((p) => p.plan === "GROWTH") : priceTable.find((p) => p.plan === "STARTER");
      const expected = currency === "NGN" ? planRow?.ngn : planRow?.usd;
      if (expected && amount !== expected) {
        log("warn", "flutterwave_amount_mismatch", { userId, plan, amount, expected, txRef });
        await markWebhookFailed(webhookEvent.id, "amount_mismatch");
        return NextResponse.json({ received: true });
      }
    }

    if (status === "successful") {
      await recordFlutterwavePayment({ ...verified, meta: verified?.meta || data?.meta });
      if (userId) {
        const existing = await prisma.subscription.findFirst({
          where: { userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INACTIVE"] } },
          orderBy: { createdAt: "desc" },
        });
        const oldPlan = existing ? subscriptionPlanToUserPlan(existing.plan) : "free";

        if (plan === "STARTER" || plan === "GROWTH") {
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
          log("info", "flutterwave_subscription_synced", { userId, plan, status: "ACTIVE" });
          log("info", "billing_plan_transition", {
            provider: "flutterwave",
            event: event || "charge.completed",
            userId,
            oldPlan,
            newPlan,
          });
        }
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user) {
          await sendTemplateEmail(
            user.email,
            "Payment received",
            `<p>Your payment was successful for ${formatCurrency(amount, currency)}. Thank you.</p>`
          );
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
