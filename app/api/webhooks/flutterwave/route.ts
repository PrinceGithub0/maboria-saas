import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SubscriptionPlan } from "@prisma/client";
import { withErrorHandling } from "@/lib/api-handler";
import { log } from "@/lib/logger";
import {
  recordFlutterwavePayment,
  verifyFlutterwaveTransactionByReference,
} from "@/lib/payments/flutterwave";
import { recordInvoicePayment, recordInvoicePaymentRefund } from "@/lib/invoice-payments";
import { getPlanFromAmount, getPlanPriceForInterval, type BillingInterval } from "@/lib/pricing";
import {
  beginWebhookEvent,
  hashWebhookPayload,
  markWebhookFailed,
  markWebhookProcessed,
} from "@/lib/webhook-events";
import { emitSystemEvent } from "@/lib/system-events";
import { isAllowedCurrency, isProviderCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { finalizeSubscriptionPayment } from "@/lib/payments/subscription";

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
    if (event && /refund|chargeback|dispute/i.test(event)) {
      if (txRef) {
        await recordInvoicePaymentRefund({
          provider: "FLUTTERWAVE",
          reference: txRef,
          amount: Number(data?.amount || 0),
          currency: data?.currency || "NGN",
          occurredAt: data?.created_at || new Date(),
          rawPayload: data,
        });
      }
      const targetCheckout = txRef
        ? await prisma.checkoutSession.findUnique({ where: { reference: txRef } })
        : null;
      const targetPayment = txRef
        ? await prisma.payment.findFirst({ where: { reference: txRef } })
        : null;
      const userId = targetCheckout?.userId || targetPayment?.userId || data?.meta?.userId;
      if (userId) {
        const sub = await prisma.subscription.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });
        if (sub) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: {
              status: "REVOKED",
              autoRenew: false,
              cancelAtPeriodEnd: true,
              cancellationReason: "chargeback_or_refund",
            },
          });
          await prisma.activityLog.create({
            data: {
              userId,
              action: "SUBSCRIPTION_REVOKED",
              resourceType: "subscription",
              resourceId: sub.id,
              metadata: { provider: "FLUTTERWAVE", event, reference: txRef },
            },
          });
        }
      }
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, revoked: true });
    }

    if (event === "charge.failed") {
      const targetCheckout = txRef
        ? await prisma.checkoutSession.findUnique({ where: { reference: txRef } })
        : null;
      if (targetCheckout) {
        await prisma.checkoutSession.update({
          where: { id: targetCheckout.id },
          data: { status: "FAILED" },
        });
        await markWebhookProcessed(webhookEvent.id);
        return NextResponse.json({ received: true, failed: true });
      }
      const userId = data?.meta?.userId as string | undefined;
      if (userId) {
        const sub = await prisma.subscription.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        });
        if (sub) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { status: "PAST_DUE", cancellationReason: "payment_failed" },
          });
          await prisma.activityLog.create({
            data: {
              userId,
              action: "SUBSCRIPTION_PAST_DUE",
              resourceType: "subscription",
              resourceId: sub.id,
              metadata: { provider: "FLUTTERWAVE", event, reference: txRef },
            },
          });
          await emitSystemEvent({
            userId,
            actorId: userId,
            eventType: "subscription_failed",
            severity: "WARNING",
            source: "BILLING",
            entityType: "subscription",
            entityId: sub.id,
            message: "Subscription payment failed.",
            metadata: {
              provider: "FLUTTERWAVE",
              event,
              reference: txRef,
            },
          });
        }
      }
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, pastDue: true });
    }

    if (event !== "charge.completed" || status !== "successful") {
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, ignored: true });
    }

    if (data?.meta?.type === "invoice_payment") {
      if (!txRef) {
        await markWebhookFailed(webhookEvent.id, "Missing invoice reference");
        return NextResponse.json({ error: "Missing invoice reference" }, { status: 400 });
      }
      const verification = await verifyFlutterwaveTransactionByReference(txRef);
      const verified = verification?.data;
      if (!verification?.status || !verified) {
        await markWebhookFailed(webhookEvent.id, "Verification failed");
        return NextResponse.json({ error: "Verification failed" }, { status: 400 });
      }
      if (verified?.status !== "successful") {
        await markWebhookFailed(webhookEvent.id, "Payment not successful");
        return NextResponse.json({ error: "Payment not successful" }, { status: 400 });
      }
      const meta = verified?.meta || {};
      if (meta?.type !== "invoice_payment") {
        await markWebhookProcessed(webhookEvent.id);
        return NextResponse.json({ received: true, ignored: true });
      }
      await recordInvoicePayment({
        provider: "FLUTTERWAVE",
        reference: verified.tx_ref || txRef,
        amount: Number(verified.amount || 0),
        currency: (verified.currency || "NGN").toUpperCase(),
        status: "SUCCEEDED",
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

    const checkout = txRef
      ? await prisma.checkoutSession.findUnique({ where: { reference: txRef } })
      : null;
    if (checkout) {
      await finalizeSubscriptionPayment({
        provider: "FLUTTERWAVE",
        reference: txRef!,
        amount: Number(checkout.amount),
        currency: checkout.currency,
        userId: checkout.userId,
        plan: checkout.plan,
        interval: checkout.billingCycle,
        paymentMethod: "Card",
        verifiedAt: data?.charged_at || data?.created_at || new Date(),
        rawPayload: data,
      });
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, checkout: true });
    }

    const amount = typeof data?.amount === "number" ? data.amount : Number(data?.amount || 0);
    const currency = normalizeCurrency(data?.currency || "USD");
    const userId = data?.meta?.userId as string | undefined;
    const customerEmail = data?.customer?.email as string | undefined;
    const rawPlan = String(data?.meta?.plan || "").toUpperCase();
    const normalizedPlan = rawPlan === "PREMIUM" ? "BUSINESS" : rawPlan;
    const rawInterval = String(data?.meta?.interval || "");
    const interval: BillingInterval = rawInterval === "yearly" ? "yearly" : "monthly";
    let plan = (["STARTER", "PRO", "GROWTH", "BUSINESS", "ENTERPRISE"].includes(normalizedPlan)
      ? (normalizedPlan as SubscriptionPlan)
      : null);

    let resolvedUserId = userId;
    if (!resolvedUserId && customerEmail) {
      const user = await prisma.user.findUnique({ where: { email: customerEmail }, select: { id: true } });
      resolvedUserId = user?.id;
    }

    if (!plan) {
      plan = getPlanFromAmount(currency, amount) as SubscriptionPlan | null;
    }

    if (!txRef || !resolvedUserId || !plan) {
      await markWebhookFailed(webhookEvent.id, "Missing payment metadata");
      return NextResponse.json({ error: "Missing payment metadata" }, { status: 400 });
    }

    const existingPayment = await prisma.payment.findFirst({ where: { reference: txRef } });
    if (existingPayment) {
      log("info", "flutterwave_webhook_duplicate", { txRef, userId: resolvedUserId });
      await recordFlutterwavePayment({ ...data, meta: { ...(data?.meta || {}), userId: resolvedUserId, plan } });
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (!isAllowedCurrency(currency) || !isProviderCurrency("FLUTTERWAVE", currency)) {
      log("warn", "flutterwave_currency_unsupported", { userId: resolvedUserId, txRef, currency });
      await prisma.payment.create({
        data: {
          userId: resolvedUserId,
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

    const expected = getPlanPriceForInterval(
      plan as "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "PREMIUM" | "ENTERPRISE",
      currency,
      interval
    );
    if (expected == null || Math.abs(amount - expected) > 0.01) {
      log("warn", "flutterwave_amount_mismatch", {
        userId: resolvedUserId,
        txRef,
        currency,
        amount,
        expected,
        interval,
      });
      await markWebhookFailed(webhookEvent.id, "Amount verification failed");
      return NextResponse.json({ error: "Amount verification failed" }, { status: 400 });
    }

    await recordFlutterwavePayment({ ...data, meta: { ...(data?.meta || {}), userId: resolvedUserId, plan } });
    log("info", "flutterwave_webhook_processed", { txRef, userId: resolvedUserId, plan });
    await markWebhookProcessed(webhookEvent.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await markWebhookFailed(webhookEvent.id, error instanceof Error ? error.message : "unknown_error");
    throw error;
  }
});

export const dynamic = "force-dynamic";
