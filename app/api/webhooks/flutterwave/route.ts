import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SubscriptionPlan } from "@prisma/client";
import { withErrorHandling } from "@/lib/api-handler";
import { log } from "@/lib/logger";
import {
  recordFlutterwavePayment,
  verifyFlutterwaveTransactionByReference,
} from "@/lib/payments/flutterwave";
import { recordInvoicePayment } from "@/lib/invoice-payments";
import { getPlanFromAmount, getPlanPriceForCurrency } from "@/lib/pricing";
import {
  beginWebhookEvent,
  hashWebhookPayload,
  markWebhookFailed,
  markWebhookProcessed,
} from "@/lib/webhook-events";
import { getUserPlan, subscriptionPlanToUserPlan } from "@/lib/entitlements";
import { isAllowedCurrency, isProviderCurrency, normalizeCurrency } from "@/lib/payments/currency-allowlist";

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

    const amount = typeof data?.amount === "number" ? data.amount : Number(data?.amount || 0);
    const currency = normalizeCurrency(data?.currency || "USD");
    const userId = data?.meta?.userId as string | undefined;
    const customerEmail = data?.customer?.email as string | undefined;
    const rawPlan = String(data?.meta?.plan || "").toUpperCase();
    let plan = (["STARTER", "GROWTH", "PREMIUM", "ENTERPRISE"].includes(rawPlan)
      ? (rawPlan as SubscriptionPlan)
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

    const expected = getPlanPriceForCurrency(plan as "STARTER" | "GROWTH" | "ENTERPRISE", currency);
    if (expected == null || Math.abs(amount - expected) > 0.01) {
      log("warn", "flutterwave_amount_mismatch", { userId: resolvedUserId, txRef, currency, amount, expected });
      await markWebhookFailed(webhookEvent.id, "Amount verification failed");
      return NextResponse.json({ error: "Amount verification failed" }, { status: 400 });
    }

    const oldPlan = await getUserPlan(resolvedUserId);
    await recordFlutterwavePayment({ ...data, meta: { ...(data?.meta || {}), userId: resolvedUserId, plan } });

    const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
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
          data: { status: "ACTIVE", renewalDate, currency },
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
          userId: resolvedUserId,
          action: "SUBSCRIPTION_UPDATED",
          resourceType: "subscription",
          resourceId: subscriptionId,
          metadata: { status: "ACTIVE", plan },
        },
      });
    }
    log("info", "billing_plan_transition", {
      provider: "flutterwave",
      event,
      userId: resolvedUserId,
      oldPlan,
      newPlan,
    });
    log("info", "flutterwave_webhook_processed", { txRef, userId: resolvedUserId, plan });
    await markWebhookProcessed(webhookEvent.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await markWebhookFailed(webhookEvent.id, error instanceof Error ? error.message : "unknown_error");
    throw error;
  }
});

export const dynamic = "force-dynamic";
