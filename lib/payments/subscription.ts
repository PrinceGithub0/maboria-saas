import "server-only";

import { prisma } from "../prisma";
import { log } from "../logger";
import { subscriptionPlanToUserPlan } from "../entitlements";
import { getPlanPriceForInterval, type BillingInterval } from "../pricing";
import { isAllowedCurrency, isProviderCurrency, normalizeCurrency } from "./currency-allowlist";
import type { PaymentProvider, SubscriptionPlan } from "@prisma/client";

const normalizePlan = (plan?: string | null): SubscriptionPlan | null => {
  if (!plan) return null;
  const normalized = String(plan).toUpperCase();
  if (normalized === "PREMIUM") return "BUSINESS";
  if (["STARTER", "PRO", "GROWTH", "BUSINESS", "ENTERPRISE"].includes(normalized)) {
    return normalized as SubscriptionPlan;
  }
  return null;
};

const resolveInterval = (value?: string | null): BillingInterval =>
  String(value || "").toLowerCase() === "yearly" ? "yearly" : "monthly";

const buildRenewalDate = (interval: BillingInterval) =>
  interval === "yearly"
    ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

export async function finalizeSubscriptionPayment({
  provider,
  reference,
  amount,
  currency,
  userId,
  plan,
  interval,
  paymentMethod,
  verifiedAt,
  rawPayload,
}: {
  provider: PaymentProvider;
  reference: string;
  amount: number;
  currency: string;
  userId: string;
  plan?: string | null;
  interval?: string | null;
  paymentMethod?: string | null;
  verifiedAt?: Date | string | null;
  rawPayload?: any;
}) {
  const normalizedPlan = normalizePlan(plan);
  if (!normalizedPlan) {
    log("warn", "subscription_payment_missing_plan", { userId, reference, provider });
    return null;
  }

  const resolvedInterval = resolveInterval(interval);
  const normalizedCurrency = normalizeCurrency(currency || "USD");
  if (!isAllowedCurrency(normalizedCurrency) || !isProviderCurrency(provider, normalizedCurrency)) {
    log("warn", "subscription_currency_unsupported", {
      userId,
      reference,
      provider,
      currency: normalizedCurrency,
    });
    return null;
  }

  const expected = getPlanPriceForInterval(
    normalizedPlan as "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "ENTERPRISE",
    normalizedCurrency,
    resolvedInterval
  );
  if (!expected || Math.abs(Number(amount) - expected) > 0.01) {
    log("warn", "subscription_amount_mismatch", {
      userId,
      reference,
      provider,
      amount,
      expected,
      currency: normalizedCurrency,
      interval: resolvedInterval,
      plan: normalizedPlan,
    });
    return null;
  }

  const renewalDate = buildRenewalDate(resolvedInterval);
  const paidAt = verifiedAt ? new Date(verifiedAt) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const existingPayment = await tx.payment.findFirst({
      where: { provider, reference },
    });
    if (existingPayment) {
      return { payment: existingPayment, subscriptionId: null, alreadyExists: true };
    }

    const existingSubscription = await tx.subscription.findFirst({
      where: { userId, plan: normalizedPlan },
      orderBy: { createdAt: "desc" },
    });

    let subscriptionId = existingSubscription?.id ?? null;
    if (existingSubscription) {
      await tx.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          status: "ACTIVE",
          renewalDate,
          currency: normalizedCurrency,
          interval: resolvedInterval,
          plan: normalizedPlan,
        },
      });
    } else {
      const created = await tx.subscription.create({
        data: {
          userId,
          plan: normalizedPlan,
          status: "ACTIVE",
          renewalDate,
          currency: normalizedCurrency,
          interval: resolvedInterval,
        },
      });
      subscriptionId = created.id;
    }

    const payment = await tx.payment.create({
      data: {
        userId,
        amount,
        currency: normalizedCurrency,
        provider,
        status: "SUCCEEDED",
        reference,
        metadata: {
          type: "subscription_payment",
          plan: normalizedPlan,
          interval: resolvedInterval,
          paymentMethod,
          verified: true,
          verifiedAt: paidAt.toISOString(),
          subscriptionId,
          raw: rawPayload || undefined,
        },
      },
    });

    if (subscriptionId) {
      await tx.activityLog.create({
        data: {
          userId,
          action: "SUBSCRIPTION_UPDATED",
          resourceType: "subscription",
          resourceId: subscriptionId,
          metadata: { status: "ACTIVE", plan: normalizedPlan },
        },
      });
    }

    const newPlan = subscriptionPlanToUserPlan(normalizedPlan);
    log("info", "billing_plan_transition", {
      provider,
      event: "payment_verified",
      userId,
      oldPlan: "free",
      newPlan,
    });

    return { payment, subscriptionId, alreadyExists: false };
  });

  return { ...result, plan: normalizedPlan, interval: resolvedInterval, paidAt };
}
