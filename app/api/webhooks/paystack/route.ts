import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SubscriptionPlan } from "@prisma/client";
import { withErrorHandling } from "@/lib/api-handler";
import { log } from "@/lib/logger";
import {
  verifyPaystackWebhook,
  verifyPaystackTransaction,
  recordPaystackPayment,
} from "@/lib/payments/paystack";
import { recordInvoicePayment, recordInvoicePaymentRefund } from "@/lib/invoice-payments";
import { getPlanFromAmount, getPlanPriceForInterval, type BillingInterval } from "@/lib/pricing";
import {
  beginWebhookEvent,
  hashWebhookPayload,
  markWebhookFailed,
  markWebhookProcessed,
} from "@/lib/webhook-events";
import { emitSystemEvent } from "@/lib/system-events";
import {
  fromMinorUnits,
  isAllowedCurrency,
  isProviderCurrency,
  normalizeCurrency,
} from "@/lib/payments/currency-allowlist";
import { finalizeSubscriptionPayment } from "@/lib/payments/subscription";

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
    if (event && /dispute|refund|chargeback|reversal/i.test(event)) {
      if (reference) {
        await recordInvoicePaymentRefund({
          provider: "PAYSTACK",
          reference,
          amount:
            typeof data?.amount === "number"
              ? fromMinorUnits(Number(data.amount || 0), data?.currency || "NGN")
              : undefined,
          currency: data?.currency || "NGN",
          occurredAt: data?.paid_at || data?.transaction_date || new Date(),
          rawPayload: data,
        });
      }
      const targetCheckout = reference
        ? await prisma.checkoutSession.findUnique({ where: { reference } })
        : null;
      const targetPayment = reference
        ? await prisma.payment.findFirst({ where: { reference } })
        : null;
      const userId = targetCheckout?.userId || targetPayment?.userId || data?.metadata?.userId;
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
              metadata: { provider: "PAYSTACK", event, reference },
            },
          });
        }
      }
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, revoked: true });
    }

    if (event === "charge.failed") {
      const targetCheckout = reference
        ? await prisma.checkoutSession.findUnique({ where: { reference } })
        : null;
      if (targetCheckout) {
        await prisma.checkoutSession.update({
          where: { id: targetCheckout.id },
          data: { status: "FAILED" },
        });
        await markWebhookProcessed(webhookEvent.id);
        return NextResponse.json({ received: true, failed: true });
      }
      const userId = data?.metadata?.userId as string | undefined;
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
              metadata: { provider: "PAYSTACK", event, reference },
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
              provider: "PAYSTACK",
              event,
              reference,
            },
          });
        }
      }
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, pastDue: true });
    }

    if (event !== "charge.success") {
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, ignored: true });
    }

    if (data?.metadata?.type === "invoice_payment") {
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
        currency: (verified.currency || "NGN").toUpperCase(),
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

    const checkout = reference
      ? await prisma.checkoutSession.findUnique({ where: { reference } })
      : null;
    if (checkout) {
      await finalizeSubscriptionPayment({
        provider: "PAYSTACK",
        reference: reference!,
        amount: Number(checkout.amount),
        currency: checkout.currency,
        userId: checkout.userId,
        plan: checkout.plan,
        interval: checkout.billingCycle,
        paymentMethod: "Card",
        verifiedAt: data?.paid_at || data?.paidAt || data?.transaction_date || new Date(),
        rawPayload: data,
      });
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, checkout: true });
    }

    const userId = data?.metadata?.userId as string | undefined;
    const customerEmail = data?.customer?.email as string | undefined;
    const rawPlan = String(data?.metadata?.plan || "").toUpperCase();
    const normalizedPlan = rawPlan === "PREMIUM" ? "BUSINESS" : rawPlan;
    const rawInterval = String(data?.metadata?.interval || "");
    const interval: BillingInterval = rawInterval === "yearly" ? "yearly" : "monthly";
    let plan = (["STARTER", "PRO", "GROWTH", "BUSINESS", "ENTERPRISE"].includes(normalizedPlan)
      ? (normalizedPlan as SubscriptionPlan)
      : null);
    const currency = normalizeCurrency(data?.currency || "NGN");
    const amountKobo = typeof data?.amount === "number" ? data.amount : Number(data?.amount || 0);

    let resolvedUserId = userId;
    if (!resolvedUserId && customerEmail) {
      const user = await prisma.user.findUnique({ where: { email: customerEmail }, select: { id: true } });
      resolvedUserId = user?.id;
    }

    const amount = fromMinorUnits(amountKobo, currency);
    if (!plan) {
      plan = getPlanFromAmount(currency, amount) as SubscriptionPlan | null;
    }

    if (!reference || !resolvedUserId || !plan) {
      await markWebhookFailed(webhookEvent.id, "Missing payment metadata");
      return NextResponse.json({ error: "Missing payment metadata" }, { status: 400 });
    }

    data.metadata = { ...(data?.metadata || {}), userId: resolvedUserId, plan, interval };

    const existingPayment = await prisma.payment.findFirst({ where: { reference } });
    if (existingPayment) {
      log("info", "paystack_webhook_duplicate", { reference, userId: resolvedUserId });
      await recordPaystackPayment(data);
      await markWebhookProcessed(webhookEvent.id);
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (!isAllowedCurrency(currency) || !isProviderCurrency("PAYSTACK", currency)) {
      log("warn", "paystack_currency_unsupported", { userId: resolvedUserId, reference, currency });
      await prisma.payment.create({
        data: {
          userId: resolvedUserId,
          amount,
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

    const expected = getPlanPriceForInterval(
      plan as "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "PREMIUM" | "ENTERPRISE",
      currency,
      interval
    );
    if (!expected || Math.abs(amount - expected) > 0.01) {
      log("warn", "paystack_amount_mismatch", {
        userId: resolvedUserId,
        reference,
        currency,
        amount,
        expected,
        interval,
      });
      await markWebhookFailed(webhookEvent.id, "Amount verification failed");
      return NextResponse.json({ error: "Amount verification failed" }, { status: 400 });
    }

    await recordPaystackPayment(data);
    log("info", "paystack_webhook_processed", { reference, userId: resolvedUserId, plan });
    await markWebhookProcessed(webhookEvent.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await markWebhookFailed(webhookEvent.id, error instanceof Error ? error.message : "unknown_error");
    throw error;
  }
});

export const dynamic = "force-dynamic";
