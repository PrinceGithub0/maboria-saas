import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { SubscriptionStatus } from "@prisma/client";

export type UserPlan = "free" | "starter" | "pro" | "enterprise";
export type EntitlementStatus = SubscriptionStatus | "INACTIVE";
export type EntitlementFeature = "dashboard" | "automations" | "workflows" | "invoices" | "ai" | "whatsapp";

export type UserEntitlement = {
  plan: UserPlan;
  status: EntitlementStatus;
  isTrialActive: boolean;
  canDashboard: boolean;
  canAutomations: boolean;
  canWorkflows: boolean;
  canInvoices: boolean;
  canAI: boolean;
  canWhatsapp: boolean;
};

const planRank: Record<UserPlan, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
};

export function isPlanAtLeast(current: UserPlan, required: UserPlan) {
  return planRank[current] >= planRank[required];
}

export function subscriptionPlanToUserPlan(plan?: string | null): UserPlan {
  switch ((plan || "").toUpperCase()) {
    case "STARTER":
      return "starter";
    case "GROWTH":
    case "PREMIUM":
      return "pro";
    case "ENTERPRISE":
      return "enterprise";
    default:
      return "free";
  }
}

export async function getUserPlan(userId: string): Promise<UserPlan> {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ["ACTIVE", "TRIALING"] } },
    orderBy: { createdAt: "desc" },
  });

  if (!sub) {
    log("info", "plan_resolved", { userId, plan: "free", reason: "no_active_subscription" });
    return "free";
  }
  if (sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt.getTime() < Date.now()) {
    log("info", "plan_resolved", { userId, plan: "free", reason: "trial_expired", subId: sub.id });
    return "free";
  }

  const plan = subscriptionPlanToUserPlan(sub.plan);
  if ((sub.status === "ACTIVE" || sub.status === "TRIALING") && plan === "free") {
    log("warn", "plan_invariant_violation", {
      userId,
      status: sub.status,
      plan: sub.plan,
      subId: sub.id,
      reason: "active_subscription_resolved_to_free",
    });
  }
  log("info", "plan_resolved", { userId, plan, status: sub.status, subId: sub.id });
  return plan;
}

export async function getEntitlementForUser(userId: string): Promise<UserEntitlement> {
  const sub = await prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (!sub) {
    return {
      plan: "free",
      status: "INACTIVE",
      isTrialActive: false,
      canDashboard: false,
      canAutomations: false,
      canWorkflows: false,
      canInvoices: false,
      canAI: false,
      canWhatsapp: false,
    };
  }

  const trialActive = Boolean(
    sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt.getTime() > Date.now()
  );

  if (sub.status === "TRIALING" && !trialActive) {
    log("info", "plan_resolved", { userId, plan: "free", reason: "trial_expired", subId: sub.id });
    const existingTrialLog = await prisma.activityLog.findFirst({
      where: { action: "TRIAL_EXPIRED", resourceId: sub.id },
      select: { id: true },
    });
    if (!existingTrialLog) {
      await prisma.activityLog.create({
        data: {
          userId,
          action: "TRIAL_EXPIRED",
          resourceType: "subscription",
          resourceId: sub.id,
          metadata: { trialEndsAt: sub.trialEndsAt },
        },
      });
    }
  }

  const active = sub.status === "ACTIVE" || trialActive;
  const resolvedPlan = subscriptionPlanToUserPlan(sub.plan);
  const plan = active ? resolvedPlan : "free";

  if (!active && resolvedPlan !== "free") {
    log("info", "plan_resolved", {
      userId,
      plan: "free",
      reason: "subscription_inactive",
      status: sub.status,
      previousPlan: resolvedPlan,
      subId: sub.id,
    });
  }

  if (active && plan === "free") {
    log("warn", "plan_invariant_violation", {
      userId,
      status: sub.status,
      plan: sub.plan,
      subId: sub.id,
      reason: "active_subscription_resolved_to_free",
    });
  }

  return {
    plan,
    status: active ? sub.status : "INACTIVE",
    isTrialActive: trialActive,
    canDashboard: active,
    canAutomations: active,
    canWorkflows: active,
    canInvoices: active,
    canAI: active && plan !== "starter" && !trialActive && isPlanAtLeast(plan, "pro"),
    canWhatsapp: active && !trialActive && isPlanAtLeast(plan, "pro"),
  };
}

export type UsageCategory = "automationRuns" | "invoices" | "aiRequests";

export type FlowCategory = "automations" | "workflows";

export const planLimits: Record<
  UserPlan,
  Partial<Record<UsageCategory, number | null>>
> = {
  free: {
    automationRuns: 10,
    invoices: 5,
    aiRequests: 0,
  },
  starter: {
    automationRuns: 100,
    invoices: 50,
    aiRequests: 0,
  },
  pro: {
    automationRuns: 1000,
    invoices: 500,
    aiRequests: 300,
  },
  enterprise: {
    automationRuns: null,
    invoices: null,
    aiRequests: null,
  },
};

export const flowLimits: Record<
  UserPlan,
  Partial<Record<FlowCategory, number | null>>
> = {
  free: {
    automations: 3,
    workflows: 3,
  },
  starter: {
    automations: 25,
    workflows: 25,
  },
  pro: {
    automations: 200,
    workflows: 200,
  },
  enterprise: {
    automations: null,
    workflows: null,
  },
};

function monthWindow() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  return { start, now };
}

export async function getUsageCountThisMonth(userId: string, category: UsageCategory) {
  const { start } = monthWindow();
  switch (category) {
    case "automationRuns":
      return prisma.automationRun.count({
        where: { userId, createdAt: { gte: start } },
      });
    case "invoices":
      return prisma.invoice.count({
        where: { userId, generatedAt: { gte: start } },
      });
    case "aiRequests":
      return prisma.aiUsageLog.count({
        where: { userId, createdAt: { gte: start } },
      });
    default:
      return 0;
  }
}

export async function enforceUsageLimit(
  userId: string,
  category: UsageCategory,
  allowTrial = true
) {
  const entitlement = await getEntitlementForUser(userId);
  if (!entitlement.canDashboard || (!allowTrial && entitlement.isTrialActive)) {
    return {
      ok: false as const,
      plan: entitlement.plan,
      limit: 0,
      used: 0,
      code: "payment_required" as const,
      reason: entitlement.isTrialActive ? "trial_restricted" : "payment_required",
    };
  }

  const plan = entitlement.plan;
  const limit = planLimits[plan][category];
  if (limit == null) return { ok: true as const, plan, limit, used: 0 };

  const used = await getUsageCountThisMonth(userId, category);
  if (used >= limit) {
    return { ok: false as const, plan, limit, used };
  }
  return { ok: true as const, plan, limit, used };
}

async function getFlowCount(userId: string, category: FlowCategory) {
  const workflowFilter = {
    OR: [{ triggers: { some: {} } }, { actions: { some: {} } }],
  };

  if (category === "workflows") {
    return prisma.automationFlow.count({ where: { userId, ...workflowFilter } });
  }

  return prisma.automationFlow.count({
    where: {
      userId,
      NOT: workflowFilter,
    },
  });
}

export async function enforceFlowLimit(
  userId: string,
  category: FlowCategory,
  allowTrial = true
) {
  const entitlement = await getEntitlementForUser(userId);
  if (!entitlement.canDashboard || (!allowTrial && entitlement.isTrialActive)) {
    return {
      ok: false as const,
      plan: entitlement.plan,
      limit: 0,
      used: 0,
      code: "payment_required" as const,
      reason: entitlement.isTrialActive ? "trial_restricted" : "payment_required",
    };
  }

  const plan = entitlement.plan;
  const limit = flowLimits[plan][category];
  if (limit == null) return { ok: true as const, plan, limit, used: 0 };

  const used = await getFlowCount(userId, category);
  if (used >= limit) {
    return { ok: false as const, plan, limit, used };
  }
  return { ok: true as const, plan, limit, used };
}

export async function enforceEntitlement(
  userId: string,
  options: { feature: EntitlementFeature; requiredPlan?: UserPlan; allowTrial?: boolean }
) {
  const entitlement = await getEntitlementForUser(userId);
  const allowTrial = options.allowTrial ?? true;

  if (!entitlement.canDashboard) {
    return {
      ok: false as const,
      type: "payment_required" as const,
      plan: entitlement.plan,
      status: entitlement.status,
      reason: "Payment required",
    };
  }

  if (!allowTrial && entitlement.isTrialActive) {
    return {
      ok: false as const,
      type: "feature_locked" as const,
      plan: entitlement.plan,
      status: entitlement.status,
      requiredPlan: options.requiredPlan ?? "pro",
      reason: "Trial plan does not include this feature",
    };
  }

  if (options.requiredPlan && !isPlanAtLeast(entitlement.plan, options.requiredPlan)) {
    return {
      ok: false as const,
      type: "upgrade_required" as const,
      plan: entitlement.plan,
      status: entitlement.status,
      requiredPlan: options.requiredPlan,
      reason: "Upgrade required",
    };
  }

  if (options.feature === "ai" && !entitlement.canAI) {
    return {
      ok: false as const,
      type: "upgrade_required" as const,
      plan: entitlement.plan,
      status: entitlement.status,
      requiredPlan: "pro",
      reason: "AI is available on Pro and Enterprise only",
    };
  }

  if (options.feature === "whatsapp" && !entitlement.canWhatsapp) {
    return {
      ok: false as const,
      type: "upgrade_required" as const,
      plan: entitlement.plan,
      status: entitlement.status,
      requiredPlan: "pro",
      reason: "WhatsApp automation is a Pro feature",
    };
  }

  return { ok: true as const, entitlement };
}

type StepLike = { type?: unknown; config?: Record<string, any>; requiresPlan?: unknown };

function stepRequiresPlan(step: StepLike | null | undefined) {
  if (!step) return null;
  const rawType = typeof step.type === "string" ? step.type.toLowerCase() : "";
  const required =
    (typeof step.requiresPlan === "string" ? step.requiresPlan : undefined) ||
    (typeof step.config?.requiresPlan === "string" ? step.config.requiresPlan : undefined);

  if (required === "enterprise") return { plan: "enterprise" as const, reason: "Enterprise-only feature" };
  if (required === "pro") return { plan: "pro" as const, reason: "Pro-only feature" };

  if (rawType.includes("whatsapp")) {
    return { plan: "pro" as const, reason: "WhatsApp automation is a Pro feature" };
  }
  if (rawType.startsWith("ai")) {
    return { plan: "pro" as const, reason: "AI steps are a Pro feature" };
  }
  return null;
}

export function requiredPlanForSteps(steps: StepLike[]) {
  for (const step of steps) {
    const requirement = stepRequiresPlan(step);
    if (requirement) return requirement;
  }
  return null;
}
