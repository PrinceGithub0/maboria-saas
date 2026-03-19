import type { SubscriptionPlan } from "@prisma/client";

import { getPlanPriceForInterval, type BillingInterval } from "@/lib/pricing";

const PLAN_ORDER: SubscriptionPlan[] = [
  "STARTER",
  "PRO",
  "GROWTH",
  "BUSINESS",
  "ENTERPRISE",
];

export type SubscriptionCheckoutAction = "new_subscription" | "renewal" | "upgrade";

export type SubscriptionCheckoutQuote = {
  action: SubscriptionCheckoutAction;
  targetPlan: SubscriptionPlan;
  targetInterval: BillingInterval;
  currentPlan: SubscriptionPlan | null;
  currentInterval: BillingInterval | null;
  fullAmount: number;
  amountDue: number;
  creditAmount: number;
  remainingRatio: number;
};

export function normalizeBillingInterval(value?: string | null): BillingInterval {
  return String(value || "").toLowerCase() === "yearly" ? "yearly" : "monthly";
}

export function compareSubscriptionPlans(a: SubscriptionPlan, b: SubscriptionPlan) {
  return PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b);
}

export function isUpgradeChange(input: {
  currentPlan: SubscriptionPlan;
  targetPlan: SubscriptionPlan;
  currentInterval: BillingInterval;
  targetInterval: BillingInterval;
}) {
  const planComparison = compareSubscriptionPlans(input.targetPlan, input.currentPlan);
  if (planComparison > 0) return true;
  if (planComparison < 0) return false;
  return input.currentInterval === "monthly" && input.targetInterval === "yearly";
}

export function isDowngradeChange(input: {
  currentPlan: SubscriptionPlan;
  targetPlan: SubscriptionPlan;
  currentInterval: BillingInterval;
  targetInterval: BillingInterval;
}) {
  const planComparison = compareSubscriptionPlans(input.targetPlan, input.currentPlan);
  if (planComparison < 0) return true;
  if (planComparison > 0) return false;
  return input.currentInterval === "yearly" && input.targetInterval === "monthly";
}

export function buildBillingPeriodWindow(interval: BillingInterval, startAt = new Date()) {
  const currentPeriodStart = new Date(startAt);
  const currentPeriodEnd =
    interval === "yearly"
      ? new Date(currentPeriodStart.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(currentPeriodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  return { currentPeriodStart, currentPeriodEnd };
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function resolveRemainingRatio(input: {
  now: Date;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  currentInterval: BillingInterval;
}) {
  const end = input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null;
  if (!end || Number.isNaN(end.getTime())) return 0;
  if (end.getTime() <= input.now.getTime()) return 0;

  const start =
    input.currentPeriodStart && !Number.isNaN(new Date(input.currentPeriodStart).getTime())
      ? new Date(input.currentPeriodStart)
      : input.currentInterval === "yearly"
        ? new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000)
        : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  const totalMs = end.getTime() - start.getTime();
  if (totalMs <= 0) return 0;

  const remainingMs = end.getTime() - input.now.getTime();
  return Math.max(0, Math.min(1, remainingMs / totalMs));
}

export function buildSubscriptionCheckoutQuote(input: {
  currency: string;
  targetPlan: SubscriptionPlan;
  targetInterval: BillingInterval;
  currentPlan?: SubscriptionPlan | null;
  currentInterval?: BillingInterval | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  now?: Date;
}) {
  const now = input.now ? new Date(input.now) : new Date();
  const fullAmount = getPlanPriceForInterval(input.targetPlan, input.currency, input.targetInterval);
  if (fullAmount == null) {
    return null;
  }

  if (!input.currentPlan || !input.currentInterval) {
    const rounded = roundCurrency(fullAmount);
    return {
      action: "new_subscription" as const,
      targetPlan: input.targetPlan,
      targetInterval: input.targetInterval,
      currentPlan: null,
      currentInterval: null,
      fullAmount: rounded,
      amountDue: rounded,
      creditAmount: 0,
      remainingRatio: 0,
    };
  }

  if (
    input.currentPlan === input.targetPlan &&
    input.currentInterval === input.targetInterval
  ) {
    const rounded = roundCurrency(fullAmount);
    return {
      action: "renewal" as const,
      targetPlan: input.targetPlan,
      targetInterval: input.targetInterval,
      currentPlan: input.currentPlan,
      currentInterval: input.currentInterval,
      fullAmount: rounded,
      amountDue: rounded,
      creditAmount: 0,
      remainingRatio: 0,
    };
  }

  const remainingRatio = resolveRemainingRatio({
    now,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    currentInterval: input.currentInterval,
  });
  const currentPrice = getPlanPriceForInterval(input.currentPlan, input.currency, input.currentInterval);
  const creditAmount =
    currentPrice == null || remainingRatio <= 0 ? 0 : roundCurrency(currentPrice * remainingRatio);
  const proratedTargetAmount =
    input.currentInterval === input.targetInterval
      ? roundCurrency(fullAmount * remainingRatio)
      : roundCurrency(fullAmount);
  const amountDue = Math.max(0, roundCurrency(proratedTargetAmount - creditAmount));

  return {
    action: "upgrade" as const,
    targetPlan: input.targetPlan,
    targetInterval: input.targetInterval,
    currentPlan: input.currentPlan,
    currentInterval: input.currentInterval,
    fullAmount: roundCurrency(fullAmount),
    amountDue,
    creditAmount,
    remainingRatio,
  };
}
