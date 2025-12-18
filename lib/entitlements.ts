import { prisma } from "@/lib/prisma";

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

  if (!sub) return "free";
  if (sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt.getTime() < Date.now()) {
    return "free";
  }

  return subscriptionPlanToUserPlan(sub.plan);
}

export type UsageCategory = "automationRuns" | "invoices" | "aiRequests";

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

