import { SubscriptionPlan } from "@prisma/client";

export type UsageFeatureKeyApi =
  | "ai_requests"
  | "invoices"
  | "automations_runs"
  | "workspace_connections"
  | "team_members_seats";

export type FeatureLimit = number | null;

export type PlanLimits = Record<UsageFeatureKeyApi, FeatureLimit>;

export const REPORT_PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  STARTER: {
    ai_requests: 100,
    invoices: 100,
    automations_runs: 3,
    workspace_connections: 2,
    team_members_seats: 1,
  },
  PRO: {
    ai_requests: 500,
    invoices: 500,
    automations_runs: 10,
    workspace_connections: 8,
    team_members_seats: 3,
  },
  GROWTH: {
    ai_requests: 2000,
    invoices: 2000,
    automations_runs: 25,
    workspace_connections: 20,
    team_members_seats: 8,
  },
  BUSINESS: {
    ai_requests: 5000,
    invoices: 7500,
    automations_runs: null,
    workspace_connections: null,
    team_members_seats: 15,
  },
  ENTERPRISE: {
    ai_requests: null,
    invoices: null,
    automations_runs: null,
    workspace_connections: null,
    team_members_seats: null,
  },
  PREMIUM: {
    ai_requests: 5000,
    invoices: 7500,
    automations_runs: null,
    workspace_connections: null,
    team_members_seats: 15,
  },
};

export function normalizeSubscriptionPlan(plan?: string | null): SubscriptionPlan {
  const value = String(plan || "").toUpperCase();
  if (value === "PREMIUM") return "BUSINESS";
  if (
    value === "STARTER" ||
    value === "PRO" ||
    value === "GROWTH" ||
    value === "BUSINESS" ||
    value === "ENTERPRISE"
  ) {
    return value;
  }
  return "STARTER";
}

export function getReportPlanLimits(plan?: string | null): PlanLimits {
  const normalized = normalizeSubscriptionPlan(plan);
  return REPORT_PLAN_LIMITS[normalized];
}

export function isUnlimitedPlan(plan?: string | null) {
  return normalizeSubscriptionPlan(plan) === "ENTERPRISE";
}
