export const UNLIMITED = -1 as const;

export type PlanLimitKey = "starter" | "pro" | "growth" | "business";

export type PlanLimitSet = {
  invoices: number;
  whatsapp: number;
  aiRequests: number;
  automations: number;
};

export const PLAN_LIMITS: Record<PlanLimitKey, PlanLimitSet> = {
  starter: {
    invoices: 50,
    whatsapp: 100,
    aiRequests: 50,
    automations: 3,
  },
  pro: {
    invoices: 300,
    whatsapp: 1000,
    aiRequests: 300,
    automations: 10,
  },
  growth: {
    invoices: 1000,
    whatsapp: 3000,
    aiRequests: 1000,
    automations: 25,
  },
  business: {
    invoices: 3000,
    whatsapp: 7500,
    aiRequests: 3000,
    automations: UNLIMITED,
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

