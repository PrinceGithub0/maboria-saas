export const UNLIMITED = -1 as const;

export type PlanLimitKey = "starter" | "pro" | "growth" | "business";

export type PlanLimitSet = {
  invoices: number;
  aiRequests: number;
  automations: number;
  connections: number;
  seats: number;
};

export const PLAN_LIMITS: Record<PlanLimitKey, PlanLimitSet> = {
  starter: {
    invoices: 100,
    aiRequests: 100,
    automations: 3,
    connections: 2,
    seats: 1,
  },
  pro: {
    invoices: 500,
    aiRequests: 500,
    automations: 10,
    connections: 8,
    seats: 3,
  },
  growth: {
    invoices: 2000,
    aiRequests: 2000,
    automations: 25,
    connections: 20,
    seats: 8,
  },
  business: {
    invoices: 7500,
    aiRequests: 5000,
    automations: UNLIMITED,
    connections: UNLIMITED,
    seats: 15,
  },
};

export function normalizePlanLimitKey(plan?: string | null): PlanLimitKey | null {
  const key = String(plan || "").toLowerCase();
  if (key === "premium") return "business";
  if (key === "starter" || key === "pro" || key === "growth" || key === "business") {
    return key;
  }
  return null;
}
