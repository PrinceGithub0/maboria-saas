import type { SubscriptionPlan } from "@prisma/client";

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  STARTER: 1,
  PRO: 2,
  GROWTH: 3,
  BUSINESS: 4,
  PREMIUM: 4,
  ENTERPRISE: 5,
};

const SCHEDULED_DOWNGRADE_TARGETS: SubscriptionPlan[] = ["STARTER", "PRO", "GROWTH", "BUSINESS"];

export function isScheduledDowngradeTarget(currentPlan: SubscriptionPlan, nextPlan: SubscriptionPlan) {
  return PLAN_RANK[nextPlan] < PLAN_RANK[currentPlan];
}

export function getScheduledDowngradeTargets(
  currentPlan: SubscriptionPlan,
  pendingPlan?: SubscriptionPlan | null
) {
  return SCHEDULED_DOWNGRADE_TARGETS.filter((plan) => {
    if (!isScheduledDowngradeTarget(currentPlan, plan)) return false;
    if (pendingPlan && plan === pendingPlan) return false;
    return true;
  });
}
