import { getPlanMeta } from "./pricing";

const PLAN_POSITIONING: Record<string, string> = {
  STARTER: "Ideal for individuals getting started with automation.",
  PRO: "More automation power, higher usage limits, and AI-assisted messaging.",
  GROWTH: "Built for scaling operations with increased limits and advanced workflows.",
  BUSINESS: "For teams managing high-volume operations with full automation flexibility.",
  PREMIUM: "For teams managing high-volume operations with full automation flexibility.",
  ENTERPRISE: "For teams managing high-volume operations with full automation flexibility.",
};

const PLAN_AUDIENCE: Record<string, string> = {
  STARTER: "independent operators",
  PRO: "service teams with ongoing client volume",
  GROWTH: "growing teams scaling operations",
  BUSINESS: "structured teams with mission-critical workflows",
  PREMIUM: "structured teams with mission-critical workflows",
  ENTERPRISE: "large organizations requiring advanced control",
};

export function getCheckoutPlanConfig(plan: string) {
  const meta = getPlanMeta(plan);
  const key = meta?.plan || String(plan || "").toUpperCase();
  const planName = meta ? `${meta.label} Plan` : `${String(plan || "Selected")} Plan`;
  return {
    planName,
    positioning:
      PLAN_POSITIONING[key] || "Built for teams improving automation and billing operations.",
    features: meta?.features ?? [],
    targetAudience: PLAN_AUDIENCE[key] || "teams modernizing their payment operations",
  };
}
