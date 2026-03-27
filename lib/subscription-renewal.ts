import "server-only";

import { Prisma, type SubscriptionPlan } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { getPlanPriceForInterval, type BillingInterval } from "@/lib/pricing";
import { normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { createFlutterwaveTokenizedCharge, parseFlutterwaveStoredPaymentMethod } from "@/lib/payments/flutterwave-recurring";
import { verifyFlutterwaveTransaction } from "@/lib/payments/flutterwave";
import { finalizeSubscriptionPayment } from "@/lib/payments/subscription";
import { ensureCurrentSubscriptionForOrg } from "@/lib/subscription-downgrade";

type RenewalAttemptResult =
  | {
      ok: true;
      status: "succeeded";
      reference: string;
    }
  | {
      ok: true;
      status: "pending_action" | "processing";
      reference: string;
      redirectUrl: string | null;
    }
  | {
      ok: false;
      reason:
        | "unsupported_provider"
        | "missing_subscription"
        | "not_due"
        | "auto_renew_disabled"
        | "missing_payment_method"
        | "missing_country"
        | "unsupported_amount"
        | "existing_pending_renewal"
        | "charge_failed";
      redirectUrl?: string | null;
      reference?: string | null;
    };

function normalizeInterval(value: string | null | undefined): BillingInterval {
  return String(value || "").toLowerCase() === "yearly" ? "yearly" : "monthly";
}

function buildRenewalReference(orgId: string) {
  return `mb_ren_${orgId.slice(-6)}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`;
}

function resolveAppUrl(req: Request | null) {
  const requestOrigin = req ? new URL(req.url).origin : null;
  if (process.env.NODE_ENV === "production") {
    return process.env.APP_URL || process.env.NEXTAUTH_URL || requestOrigin || "http://localhost:3000";
  }
  return requestOrigin || process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function resolveRenewalDueAt(input: { paidThroughAt: Date | null; currentCycleEndAt: Date | null }) {
  return input.paidThroughAt ?? input.currentCycleEndAt ?? null;
}

export function resolveRenewalCheckoutRedirectUrl(providerPayload: Prisma.JsonValue | null | undefined) {
  if (!providerPayload || typeof providerPayload !== "object" || Array.isArray(providerPayload)) {
    return null;
  }

  const payload = providerPayload as Record<string, unknown>;
  const direct = String(payload.nextActionUrl || "").trim();
  if (direct) return direct;

  const providerInit =
    payload.providerInit && typeof payload.providerInit === "object" && !Array.isArray(payload.providerInit)
      ? (payload.providerInit as Record<string, unknown>)
      : null;
  const data =
    providerInit?.data && typeof providerInit.data === "object" && !Array.isArray(providerInit.data)
      ? (providerInit.data as Record<string, unknown>)
      : null;

  const fallback = String(data?.link || "").trim();
  return fallback || null;
}

export async function getPendingRenewalCheckoutForSubscription(subscriptionId: string) {
  return prisma.checkoutSession.findFirst({
    where: {
      subscriptionId,
      provider: "FLUTTERWAVE",
      status: { in: ["CREATED", "REDIRECTED"] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      reference: true,
      status: true,
      providerPayload: true,
      createdAt: true,
    },
  });
}

export async function attemptFlutterwaveSubscriptionRenewal(input: {
  ownerUserId: string;
  orgId: string;
  req?: Request | null;
  now?: Date;
}): Promise<RenewalAttemptResult> {
  const now = input.now ?? new Date();
  const orgSub = await prisma.orgSubscription.findUnique({
    where: { orgId: input.orgId },
    select: {
      orgId: true,
      planId: true,
      provider: true,
      paidThroughAt: true,
      currentCycleEndAt: true,
      providerPaymentMethodData: true,
      org: {
        select: {
          name: true,
          ownerId: true,
          owner: {
            select: {
              businessProfile: { select: { country: true, businessName: true } },
            },
          },
        },
      },
    },
  });

  if (!orgSub || orgSub.provider !== "FLUTTERWAVE") {
    return { ok: false, reason: "unsupported_provider" };
  }

  const subscription = await ensureCurrentSubscriptionForOrg(input.ownerUserId, input.orgId);
  if (!subscription) {
    return { ok: false, reason: "missing_subscription" };
  }

  const dueAt = resolveRenewalDueAt({
    paidThroughAt: orgSub.paidThroughAt,
    currentCycleEndAt: subscription.currentPeriodEnd ?? null,
  });
  if (!dueAt || dueAt.getTime() > now.getTime()) {
    return { ok: false, reason: "not_due" };
  }

  if (subscription.autoRenew === false || subscription.cancelAtPeriodEnd === true) {
    return { ok: false, reason: "auto_renew_disabled" };
  }

  const storedMethod = parseFlutterwaveStoredPaymentMethod(orgSub.providerPaymentMethodData);
  if (!storedMethod) {
    return { ok: false, reason: "missing_payment_method" };
  }

  const existingPending = await getPendingRenewalCheckoutForSubscription(subscription.id);
  if (existingPending) {
    const redirectUrl = resolveRenewalCheckoutRedirectUrl(existingPending.providerPayload);
    return {
      ok: false,
      reason: "existing_pending_renewal",
      redirectUrl,
      reference: existingPending.reference,
    };
  }

  const interval = normalizeInterval(subscription.interval);
  const currency = normalizeCurrency(subscription.currency || "USD");
  const amount = getPlanPriceForInterval(subscription.plan as SubscriptionPlan, currency, interval);
  if (!amount || amount <= 0) {
    return { ok: false, reason: "unsupported_amount" };
  }

  const country =
    storedMethod.country ||
    orgSub.org.owner.businessProfile?.country ||
    null;
  if (!country) {
    return { ok: false, reason: "missing_country" };
  }

  const reference = buildRenewalReference(input.orgId);
  const appUrl = resolveAppUrl(input.req ?? null);
  const checkout = await prisma.checkoutSession.create({
    data: {
      userId: input.ownerUserId,
      subscriptionId: subscription.id,
      plan: subscription.plan,
      billingCycle: interval,
      provider: "FLUTTERWAVE",
      currency,
      amount,
      reference,
      status: "CREATED",
      providerPayload: {
        checkoutContext: {
          action: "renewal",
          currentPlan: subscription.plan,
          currentInterval: interval,
          targetPlan: subscription.plan,
          targetInterval: interval,
          fullAmount: amount,
          amountDue: amount,
          creditAmount: 0,
          remainingRatio: 0,
        },
        renewalAttemptedAt: now.toISOString(),
        source: "stored_payment_method",
      } as Prisma.InputJsonValue,
    },
  });

  try {
    const init = await createFlutterwaveTokenizedCharge({
      token: storedMethod.token,
      email: storedMethod.email,
      fullName:
        storedMethod.fullName ||
        orgSub.org.owner.businessProfile?.businessName ||
        orgSub.org.name,
      country,
      currency,
      amount,
      txRef: reference,
      redirectUrl: `${appUrl}/checkout/return?reference=${encodeURIComponent(reference)}`,
      narration: `Maboria ${subscription.plan} renewal`,
      traceId: storedMethod.traceId,
      metadata: {
        type: "checkout_session",
        checkoutSessionId: checkout.id,
        subscriptionId: subscription.id,
        userId: input.ownerUserId,
        plan: subscription.plan,
        interval,
        country,
        renewalSource: "stored_payment_method",
      },
    });

    const redirectUrl =
      String(init?.data?.redirect_url || init?.data?.link || init?.link || "").trim() || null;
    const providerStatus = String(init?.data?.status || init?.status || "").toLowerCase();
    const providerTransactionId = init?.data?.id;

    await prisma.checkoutSession.update({
      where: { id: checkout.id },
      data: {
        status: redirectUrl ? "REDIRECTED" : "CREATED",
        providerPayload: {
          checkoutContext: {
            action: "renewal",
            currentPlan: subscription.plan,
            currentInterval: interval,
            targetPlan: subscription.plan,
            targetInterval: interval,
            fullAmount: amount,
            amountDue: amount,
            creditAmount: 0,
            remainingRatio: 0,
          },
          nextActionUrl: redirectUrl,
          providerInit: init,
          renewalAttemptedAt: now.toISOString(),
          source: "stored_payment_method",
        } as Prisma.InputJsonValue,
      },
    });

    if (providerStatus === "successful" && providerTransactionId) {
      const verification = await verifyFlutterwaveTransaction(providerTransactionId);
      const verified = verification?.data;
      if (verification?.status === "success" && verified?.status === "successful") {
        await finalizeSubscriptionPayment({
          provider: "FLUTTERWAVE",
          reference,
          amount: Number(verified.amount || amount),
          currency: normalizeCurrency(verified.currency || currency),
          userId: input.ownerUserId,
          plan: subscription.plan,
          interval,
          paymentMethod: "Card",
          verifiedAt: verified?.charged_at || verified?.created_at || now,
          rawPayload: verified,
        });
        return { ok: true, status: "succeeded", reference };
      }
    }

    return {
      ok: true,
      status: redirectUrl ? "pending_action" : "processing",
      reference,
      redirectUrl,
    };
  } catch (error) {
    await prisma.checkoutSession.update({
      where: { id: checkout.id },
      data: { status: "FAILED" },
    });
    log("error", "flutterwave_subscription_renewal_attempt_failed", {
      orgId: input.orgId,
      userId: input.ownerUserId,
      subscriptionId: subscription.id,
      reference,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return { ok: false, reason: "charge_failed" };
  }
}

export async function processDueFlutterwaveSubscriptionRenewals(now = new Date()) {
  const dueSubscriptions = await prisma.orgSubscription.findMany({
    where: {
      provider: "FLUTTERWAVE",
      OR: [
        { paidThroughAt: { lte: now } },
        { currentCycleEndAt: { lte: now } },
      ],
    },
    select: {
      orgId: true,
      org: { select: { ownerId: true } },
    },
  });

  let processed = 0;
  let succeeded = 0;
  let pending = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of dueSubscriptions) {
    processed += 1;
    const result = await attemptFlutterwaveSubscriptionRenewal({
      ownerUserId: item.org.ownerId,
      orgId: item.orgId,
      now,
    });
    if (!result.ok) {
      if (
        result.reason === "not_due" ||
        result.reason === "auto_renew_disabled" ||
        result.reason === "missing_payment_method" ||
        result.reason === "existing_pending_renewal"
      ) {
        skipped += 1;
      } else {
        failed += 1;
      }
      continue;
    }

    if (result.status === "succeeded") {
      succeeded += 1;
    } else {
      pending += 1;
    }
  }

  return { processed, succeeded, pending, skipped, failed };
}
