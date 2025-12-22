import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export type UserPlan = "free" | "starter" | "pro" | "enterprise";

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

export async function enforceUsageLimit(userId: string, category: UsageCategory) {
  const plan = await getUserPlan(userId);
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

export async function enforceFlowLimit(userId: string, category: FlowCategory) {
  const plan = await getUserPlan(userId);
  const limit = flowLimits[plan][category];
  if (limit == null) return { ok: true as const, plan, limit, used: 0 };

  const used = await getFlowCount(userId, category);
  if (used >= limit) {
    return { ok: false as const, plan, limit, used };
  }
  return { ok: true as const, plan, limit, used };
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
