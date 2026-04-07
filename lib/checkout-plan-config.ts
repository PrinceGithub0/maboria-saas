import { getPlanMeta } from "./pricing";

const PLAN_POSITIONING: Record<string, string> = {
  STARTER: "For solo operators getting billing, inbox, and follow-ups under control.",
  PRO: "For small teams running customer communication and daily operations together.",
  GROWTH: "For growing teams that need structure, routing, and visibility.",
  BUSINESS: "For companies that need control, accountability, and operational oversight.",
  PREMIUM: "For companies that need control, accountability, and operational oversight.",
  ENTERPRISE: "For organizations with custom workflows, controls, and rollout needs.",
};

const PLAN_AUDIENCE: Record<string, string> = {
  STARTER: "solo operators",
  PRO: "small operating teams",
  GROWTH: "growing support and revenue teams",
  BUSINESS: "structured companies with admin and compliance needs",
  PREMIUM: "structured companies with admin and compliance needs",
  ENTERPRISE: "large organizations requiring custom rollout support",
};

export function getCheckoutPlanConfig(plan: string) {
  const meta = getPlanMeta(plan);
  const key = meta?.plan || String(plan || "").toUpperCase();
  const planName = meta ? `${meta.label} Plan` : `${String(plan || "Selected")} Plan`;
  return {
    planName,
    positioning:
      PLAN_POSITIONING[key] || "Built for teams improving invoicing, inbox workflows, and operational control.",
    features: meta?.features ?? [],
    targetAudience: PLAN_AUDIENCE[key] || "teams modernizing billing and customer operations",
  };
}
