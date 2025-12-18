type Plan = "STARTER" | "GROWTH" | "ENTERPRISE";
type Currency = "USD" | "NGN";

type PricingMeta = { usd?: number; ngn?: number; displayName: string; features: string[] };

export const TRIAL_DAYS = 7;

// Pricing is intentionally kept as a small, hardcoded table so UI can render without a DB dependency.
// "GROWTH" maps to the "Pro" plan label in the UI to avoid breaking existing SubscriptionPlan values.
const pricingTable: Record<Plan, PricingMeta> = {
  STARTER: {
    usd: 9,
    ngn: 7000,
    displayName: "Starter",
    features: ["Core automations", "Invoices", "Email notifications", "Team-ready basics"],
  },
  GROWTH: {
    usd: 19,
    ngn: 15000,
    displayName: "Pro",
    features: ["AI assistant", "WhatsApp automation", "Higher usage limits", "Priority support"],
  },
  ENTERPRISE: {
    displayName: "Enterprise",
    features: ["Custom limits", "Advanced controls", "SLA options", "Dedicated support"],
  },
};

export function getPlanPrice(plan: Plan, currency: Currency) {
  const data = pricingTable[plan];
  return currency === "USD" ? data.usd : data.ngn;
}

export function pricingTableForUI(currency: Currency) {
  const ordered: Plan[] = ["STARTER", "GROWTH", "ENTERPRISE"];
  return ordered.map((plan) => {
    const meta = pricingTable[plan];
    return {
      plan,
      label: meta.displayName,
      price: currency === "USD" ? meta.usd ?? null : meta.ngn ?? null,
      features: meta.features,
    };
  });
}

export function pricingTableDualCurrency() {
  const ordered: Plan[] = ["STARTER", "GROWTH", "ENTERPRISE"];
  return ordered.map((plan) => {
    const meta = pricingTable[plan];
    return {
      plan,
      label: meta.displayName,
      usd: meta.usd ?? null,
      ngn: meta.ngn ?? null,
      features: meta.features,
    };
  });
}
