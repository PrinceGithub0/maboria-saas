type Plan = "STARTER" | "GROWTH" | "PREMIUM" | "ENTERPRISE";
type Currency = "USD" | "NGN";

const pricingTable: Record<Plan, { usd: number; ngn: number; features: string[] }> = {
  STARTER: { usd: 29, ngn: 20000, features: ["Basic automations", "Email support", "100 runs/mo"] },
  GROWTH: {
    usd: 99,
    ngn: 75000,
    features: ["Unlimited runs", "AI assistant", "Webhook automation", "Priority support"],
  },
  PREMIUM: {
    usd: 199,
    ngn: 150000,
    features: ["Premium AI flows", "Advanced insights", "Dedicated support", "Sandbox environments"],
  },
  ENTERPRISE: {
    usd: 399,
    ngn: 300000,
    features: ["Custom SLAs", "Dedicated CSM", "Security reviews", "On-prem options"],
  },
};

export function getPlanPrice(plan: Plan, currency: Currency) {
  const data = pricingTable[plan];
  return currency === "USD" ? data.usd : data.ngn;
}

export function pricingTableForUI(currency: Currency) {
  return Object.entries(pricingTable).map(([plan, meta]) => ({
    plan,
    price: currency === "USD" ? meta.usd : meta.ngn,
    features: meta.features,
  }));
}
