import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { SubscriptionStatus } from "@prisma/client";

export type UserPlan = "free" | "starter" | "pro" | "growth" | "business" | "enterprise";
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
  growth: 3,
  business: 4,
  enterprise: 5,
};

export function isPlanAtLeast(current: UserPlan, required: UserPlan) {
  return planRank[current] >= planRank[required];
}

export function nextPlanAfter(plan: UserPlan): UserPlan {
  switch (plan) {
    case "free":
      return "starter";
    case "starter":
      return "pro";
    case "pro":
      return "growth";
    case "growth":
      return "business";
    case "business":
      return "enterprise";
    case "enterprise":
    default:
      return "enterprise";
  }
}

export function subscriptionPlanToUserPlan(plan?: string | null): UserPlan {
  switch ((plan || "").toUpperCase()) {
    case "STARTER":
      return "starter";
    case "PRO":
      return "pro";
    case "GROWTH":
      return "growth";
    case "BUSINESS":
      return "business";
    case "PREMIUM":
      return "business";
    case "ENTERPRISE":
      return "enterprise";
    default:
      return "free";
  }
}

export async function getUserPlan(userId: string): Promise<UserPlan> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === "ADMIN") {
    log("info", "plan_resolved", { userId, plan: "enterprise", reason: "admin_override" });
    return "enterprise";
  }

  const sub = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  if (!sub) {
    log("info", "plan_resolved", { userId, plan: "free", reason: "no_active_subscription" });
    return "free";
  }
  const plan = subscriptionPlanToUserPlan(sub.plan);
  if (sub.status === "ACTIVE" && plan === "free") {
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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === "ADMIN") {
    return {
      plan: "enterprise",
      status: "ACTIVE",
      isTrialActive: false,
      canDashboard: true,
      canAutomations: true,
      canWorkflows: true,
      canInvoices: true,
      canAI: true,
      canWhatsapp: true,
    };
  }

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

  const active = sub.status === "ACTIVE";
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
    isTrialActive: false,
    canDashboard: active,
    canAutomations: active,
    canWorkflows: active,
    canInvoices: active,
    canAI: active && isPlanAtLeast(plan, "starter"),
    canWhatsapp: active && isPlanAtLeast(plan, "starter"),
  };
}

export type UsageCategory = "automationRuns" | "invoices" | "aiRequests" | "whatsappMessages";

export type FlowCategory = "automations" | "workflows";

export const planLimits: Record<
  UserPlan,
  Partial<Record<UsageCategory, number | null>>
> = {
  free: {
    automationRuns: 0,
    invoices: 0,
    aiRequests: 0,
    whatsappMessages: 0,
  },
  starter: {
    automationRuns: 3,
    invoices: 50,
    aiRequests: 50,
    whatsappMessages: 100,
  },
  pro: {
    automationRuns: 10,
    invoices: 300,
    aiRequests: 300,
    whatsappMessages: 1000,
  },
  growth: {
    automationRuns: 25,
    invoices: 1000,
    aiRequests: 1000,
    whatsappMessages: 3000,
  },
  business: {
    automationRuns: null,
    invoices: 3000,
    aiRequests: 3000,
    whatsappMessages: 7500,
  },
  enterprise: {
    automationRuns: null,
    invoices: null,
    aiRequests: null,
    whatsappMessages: null,
  },
};

export const flowLimits: Record<
  UserPlan,
  Partial<Record<FlowCategory, number | null>>
> = {
  free: {
    automations: 0,
    workflows: 0,
  },
  starter: {
    automations: 3,
    workflows: 3,
  },
  pro: {
    automations: 10,
    workflows: 10,
  },
  growth: {
    automations: 25,
    workflows: 25,
  },
  business: {
    automations: null,
    workflows: null,
  },
  enterprise: {
    automations: null,
    workflows: null,
  },
};

function addUtcMonths(date: Date, months: number) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()));
  return next;
}

async function resolveUsageScope(userId: string) {
  const owned = await prisma.business.findFirst({
    where: { ownerId: userId },
    select: {
      id: true,
      ownerId: true,
      billingCycleStartAt: true,
      usageResetAt: true,
      createdAt: true,
    },
  });
  if (owned) {
    return { business: owned };
  }
  const member = await prisma.businessMember.findFirst({
    where: { userId },
    select: {
      business: {
        select: {
          id: true,
          ownerId: true,
          billingCycleStartAt: true,
          usageResetAt: true,
          createdAt: true,
        },
      },
    },
  });
  return { business: member?.business ?? null };
}

async function ensureUsageWindow(userId: string) {
  const now = new Date();
  const scope = await resolveUsageScope(userId);
  const business = scope.business;
  if (!business) {
    const sub = await prisma.subscription.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const start =
      sub?.createdAt ??
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    return { start, resetAt: addUtcMonths(start, 1), businessId: null, ownerId: userId, userIds: [userId] };
  }

  let billingCycleStartAt = business.billingCycleStartAt ?? null;
  let usageResetAt = business.usageResetAt ?? null;

  if (!billingCycleStartAt || !usageResetAt) {
    const sub = await prisma.subscription.findFirst({
      where: { userId: business.ownerId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const anchor = sub?.createdAt ?? business.createdAt ?? now;
    billingCycleStartAt = billingCycleStartAt ?? anchor;
    usageResetAt = usageResetAt ?? addUtcMonths(billingCycleStartAt, 1);
  }

  if (usageResetAt <= now) {
    let nextStart = usageResetAt;
    let nextReset = addUtcMonths(nextStart, 1);
    while (nextReset <= now) {
      nextStart = nextReset;
      nextReset = addUtcMonths(nextStart, 1);
    }
    billingCycleStartAt = nextStart;
    usageResetAt = nextReset;
    await prisma.business.update({
      where: { id: business.id },
      data: { billingCycleStartAt, usageResetAt },
    });
  } else if (!business.billingCycleStartAt || !business.usageResetAt) {
    await prisma.business.update({
      where: { id: business.id },
      data: { billingCycleStartAt, usageResetAt },
    });
  }

  const members = await prisma.businessMember.findMany({
    where: { businessId: business.id },
    select: { userId: true },
  });
  const userIds = Array.from(new Set([business.ownerId, ...members.map((m) => m.userId)]));
  return { start: billingCycleStartAt, resetAt: usageResetAt, businessId: business.id, ownerId: business.ownerId, userIds };
}

export async function getWorkspaceScope(userId: string) {
  return ensureUsageWindow(userId);
}

export async function getUsageCountThisMonth(userId: string, category: UsageCategory) {
  const { start, businessId, userIds } = await ensureUsageWindow(userId);
  switch (category) {
    case "automationRuns":
      return prisma.automationRun.count({
        where: {
          userId: { in: userIds },
          createdAt: { gte: start },
          runStatus: "SUCCESS",
        },
      });
    case "invoices":
      return prisma.invoice.count({
        where: { userId: { in: userIds }, generatedAt: { gte: start } },
      });
    case "aiRequests":
      return prisma.aiUsageLog.count({
        where: { userId: { in: userIds }, createdAt: { gte: start } },
      });
    case "whatsappMessages":
      if (!businessId) return 0;
      return prisma.message.count({
        where: {
          conversation: { businessId },
          direction: "OUTBOUND",
          status: { in: ["SENT", "DELIVERED"] },
          createdAt: { gte: start },
        },
      });
    default:
      return 0;
  }
}

export async function getTeamSeatUsageThisMonth(userId: string) {
  const { start, businessId, ownerId } = await ensureUsageWindow(userId);
  if (!businessId || !ownerId) return 0;
  return prisma.usageRecord.count({
    where: { userId: ownerId, category: "team_seat", createdAt: { gte: start } },
  });
}

export async function enforceUsageLimit(
  userId: string,
  category: UsageCategory
) {
  const entitlement = await getEntitlementForUser(userId);
  if (!entitlement.canDashboard) {
    return {
      ok: false as const,
      plan: entitlement.plan,
      limit: 0,
      used: 0,
      code: "payment_required" as const,
      reason: "payment_required",
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
  const { userIds } = await ensureUsageWindow(userId);
  const workflowFilter = {
    OR: [{ triggers: { some: {} } }, { actions: { some: {} } }],
  };

  if (category === "workflows") {
    return prisma.automationFlow.count({ where: { userId: { in: userIds }, ...workflowFilter } });
  }

  return prisma.automationFlow.count({
    where: {
      userId: { in: userIds },
    },
  });
}

export async function enforceFlowLimit(
  userId: string,
  category: FlowCategory
) {
  const entitlement = await getEntitlementForUser(userId);
  if (!entitlement.canDashboard) {
    return {
      ok: false as const,
      plan: entitlement.plan,
      limit: 0,
      used: 0,
      code: "payment_required" as const,
      reason: "payment_required",
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
  const allowTrial = options.allowTrial ?? false;

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
      requiredPlan: options.requiredPlan ?? "starter",
      reason: "Payment required",
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
      requiredPlan: "starter",
      reason: "AI is available on Starter and higher plans",
    };
  }

  if (options.feature === "whatsapp" && !entitlement.canWhatsapp) {
    return {
      ok: false as const,
      type: "upgrade_required" as const,
      plan: entitlement.plan,
      status: entitlement.status,
      requiredPlan: "starter",
      reason: "WhatsApp automation is available on Starter and higher plans",
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
  if (required === "starter") return { plan: "starter" as const, reason: "Starter-only feature" };

  if (rawType.includes("whatsapp")) {
    return { plan: "starter" as const, reason: "WhatsApp automation is a Starter feature" };
  }
  if (rawType.startsWith("ai")) {
    return { plan: "starter" as const, reason: "AI steps are a Starter feature" };
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
