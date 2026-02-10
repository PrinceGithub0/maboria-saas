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
import { recordInvoicePayment } from "@/lib/invoice-payments";
import { getPlanFromAmount, getPlanPriceForInterval, type BillingInterval } from "@/lib/pricing";
import {
  beginWebhookEvent,
  hashWebhookPayload,
  markWebhookFailed,
  markWebhookProcessed,
} from "@/lib/webhook-events";
import { getUserPlan, subscriptionPlanToUserPlan } from "@/lib/entitlements";
import {
  fromMinorUnits,
  isAllowedCurrency,
  isProviderCurrency,
  normalizeCurrency,
} from "@/lib/payments/currency-allowlist";

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
      const interval: BillingInterval =
        checkout.billingCycle === "yearly" ? "yearly" : "monthly";
      const now = new Date();
      const periodEnd =
        interval === "yearly"
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await prisma.$transaction(async (tx) => {
        await tx.checkoutSession.update({
          where: { id: checkout.id },
          data: { status: "SUCCESS" },
        });
        await tx.subscription.update({
          where: { id: checkout.subscriptionId },
          data: {
            status: "ACTIVE",
            plan: checkout.plan,
            provider: "PAYSTACK",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            autoRenew: true,
            cancelAtPeriodEnd: false,
            interval: checkout.billingCycle,
            currency: checkout.currency,
            renewalDate: periodEnd,
          },
        });
        await tx.payment.create({
          data: {
            userId: checkout.userId,
            amount: checkout.amount,
            currency: checkout.currency,
            provider: "PAYSTACK",
            status: "SUCCEEDED",
            reference,
            metadata: {
              type: "checkout_session",
              checkoutSessionId: checkout.id,
              subscriptionId: checkout.subscriptionId,
            },
          },
        });
        const invoiceNumber = `INV-${Date.now()}`;
        await tx.invoice.create({
          data: {
            userId: checkout.userId,
            subscriptionId: checkout.subscriptionId,
            invoiceNumber,
            items: [
              {
                name: `${checkout.plan} subscription (${checkout.billingCycle})`,
                quantity: 1,
                price: Number(checkout.amount),
              },
            ],
            total: checkout.amount,
            currency: checkout.currency,
            status: "PAID",
            plan: checkout.plan,
            metadata: { checkoutSessionId: checkout.id },
          },
        });
        await tx.activityLog.create({
          data: {
            userId: checkout.userId,
            action: "PAYMENT_SUCCESS",
            resourceType: "checkout_session",
            resourceId: checkout.id,
            metadata: { provider: "PAYSTACK", plan: checkout.plan },
          },
        });
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

    const oldPlan = await getUserPlan(resolvedUserId);
    await recordPaystackPayment(data);

    const renewalDate =
      interval === "yearly"
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    let subscriptionId: string | null = null;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${resolvedUserId}))`;
      const existingForPlan = await tx.subscription.findFirst({
        where: { userId: resolvedUserId, plan },
        orderBy: { createdAt: "desc" },
      });
      if (existingForPlan) {
        await tx.subscription.update({
          where: { id: existingForPlan.id },
          data: { status: "ACTIVE", renewalDate, currency, interval },
        });
        subscriptionId = existingForPlan.id;
      } else {
        const created = await tx.subscription.create({
          data: {
            userId: resolvedUserId,
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
          userId: resolvedUserId,
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
      userId: resolvedUserId,
      oldPlan,
      newPlan,
    });
    log("info", "paystack_webhook_processed", { reference, userId: resolvedUserId, plan });
    await markWebhookProcessed(webhookEvent.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await markWebhookFailed(webhookEvent.id, error instanceof Error ? error.message : "unknown_error");
    throw error;
  }
});

export const dynamic = "force-dynamic";
