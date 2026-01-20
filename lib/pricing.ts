import { STANDARD_VAT_RATE, applyVatToSubtotal } from "./vat";

type Plan = "STARTER" | "GROWTH" | "ENTERPRISE";
type Currency = "USD" | "NGN";

type PricingMeta = { usd?: number; ngn?: number; displayName: string; features: string[] };

export const TRIAL_DAYS = 7;

// Pricing is intentionally kept as a small, hardcoded table so UI can render without a DB dependency.
// "GROWTH" maps to the "Pro" plan label in the UI to avoid breaking existing SubscriptionPlan values.
const pricingTable: Record<Plan, PricingMeta> = {
  STARTER: {
    ngn: 15000,
    displayName: "Starter",
    features: ["Core automations", "Invoices", "Email notifications", "Team-ready basics"],
  },
  GROWTH: {
    ngn: 40000,
    displayName: "Pro",
    features: ["AI assistant", "WhatsApp automation", "Higher usage limits", "Priority support"],
  },
  ENTERPRISE: {
    displayName: "Enterprise",
    features: ["Custom limits", "Advanced controls", "SLA options", "Dedicated support"],
  },
};

// Fixed FX conversion rates (NGN per 1 unit of currency). Edit here to update all displays safely.
export const FX_RATES_NGN_PER: Record<string, number> = {
  NGN: 1,
  USD: 1450,
  GHS: 120,
  KES: 9,
  ZAR: 75,
  XOF: 2.4,
  UGX: 0.38,
  TZS: 0.6,
  RWF: 1.1,
  ZMW: 55,
  MZN: 23,
  EGP: 30,
  GBP: 1850,
  EUR: 1600,
};

export function getPlanPriceForCurrency(plan: Plan, currency: string) {
  const data = pricingTable[plan];
  const ngn = data.ngn ?? null;
  if (!ngn) return null;
  const rate = FX_RATES_NGN_PER[currency.toUpperCase()] ?? FX_RATES_NGN_PER.NGN;
  const base = ngn / rate;
  const { total } = applyVatToSubtotal(base, STANDARD_VAT_RATE);
  return Math.round(total * 100) / 100;
}

export function getPlanFromAmount(currency: string, amount: number) {
  const normalized = currency.toUpperCase();
  const ordered: Plan[] = ["STARTER", "GROWTH", "ENTERPRISE"];
  for (const plan of ordered) {
    const expected = getPlanPriceForCurrency(plan, normalized);
    if (expected == null) continue;
    if (Math.abs(expected - amount) < 0.01) return plan;
  }
  return null;
}

export function getPlanPrice(plan: Plan, currency: Currency) {
  const data = pricingTable[plan];
  if (currency === "NGN" && data.ngn) {
    const { total } = applyVatToSubtotal(data.ngn, STANDARD_VAT_RATE);
    return total;
  }
  return getPlanPriceForCurrency(plan, currency);
}

export function pricingTableForUI(currency: Currency) {
  const ordered: Plan[] = ["STARTER", "GROWTH", "ENTERPRISE"];
  return ordered.map((plan) => {
    const meta = pricingTable[plan];
    const ngnWithVat = meta.ngn ? applyVatToSubtotal(meta.ngn, STANDARD_VAT_RATE).total : null;
    return {
      plan,
      label: meta.displayName,
      price: currency === "USD" ? getPlanPriceForCurrency(plan, "USD") : ngnWithVat,
      features: meta.features,
    };
  });
}

export function pricingTableDualCurrency() {
  const ordered: Plan[] = ["STARTER", "GROWTH", "ENTERPRISE"];
  return ordered.map((plan) => {
    const meta = pricingTable[plan];
    const ngnWithVat = meta.ngn ? applyVatToSubtotal(meta.ngn, STANDARD_VAT_RATE).total : null;
    return {
      plan,
      label: meta.displayName,
      usd: getPlanPriceForCurrency(plan, "USD"),
      ngn: ngnWithVat,
      features: meta.features,
    };
  });
}
