import { SubscriptionPlan } from "@prisma/client";

export type UsageFeatureKeyApi =
  | "ai_requests"
  | "invoices"
  | "whatsapp_messages"
  | "automations_runs"
  | "team_members_seats";

export type FeatureLimit = number | null;

export type PlanLimits = Record<UsageFeatureKeyApi, FeatureLimit>;

export const REPORT_PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  STARTER: {
    ai_requests: 50,
    invoices: 50,
    whatsapp_messages: 100,
    automations_runs: 3,
    team_members_seats: 1,
  },
  PRO: {
    ai_requests: 300,
    invoices: 300,
    whatsapp_messages: 1000,
    automations_runs: 10,
    team_members_seats: 3,
  },
  GROWTH: {
    ai_requests: 1000,
    invoices: 1000,
    whatsapp_messages: 3000,
    automations_runs: 25,
    team_members_seats: 5,
  },
  BUSINESS: {
    ai_requests: 3000,
    invoices: 3000,
    whatsapp_messages: 7500,
    automations_runs: null,
    team_members_seats: 10,
  },
  ENTERPRISE: {
    ai_requests: null,
    invoices: null,
    whatsapp_messages: null,
    automations_runs: null,
    team_members_seats: null,
  },
  PREMIUM: {
    ai_requests: 3000,
    invoices: 3000,
    whatsapp_messages: 7500,
    automations_runs: null,
    team_members_seats: 10,
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

