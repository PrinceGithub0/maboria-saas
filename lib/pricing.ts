import { STANDARD_VAT_RATE, applyVatToSubtotal } from "./vat";

export type Plan = "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "PREMIUM" | "ENTERPRISE";
export type BillingInterval = "monthly" | "yearly";
type Currency = "USD" | "NGN";

type PricingMeta = { usd?: number; ngn?: number; displayName: string; features: string[] };

// Pricing is intentionally kept as a small, hardcoded table so UI can render without a DB dependency.
// "BUSINESS" is the canonical plan name; "PREMIUM" is kept as a legacy alias for older data.
const businessMeta: PricingMeta = {
  ngn: 361050,
  usd: 249,
  displayName: "Business",
  features: [
    "Invoices: 3,000 / month",
    "WhatsApp messages: 7,500 / month",
    "AI usage: 3,000 / month",
    "Automations: Unlimited",
    "Up to 10 team members",
    "Role-based access",
    "Phone + priority support",
  ],
};

const pricingTable: Record<Plan, PricingMeta> = {
  STARTER: {
    ngn: 42050,
    usd: 29,
    displayName: "Starter",
    features: [
      "Invoices: 50 / month",
      "Payments (cards & bank transfer)",
      "WhatsApp messages: 100 / month",
      "AI usage: 50 / month",
      "Automations: 3 total",
      "1 user",
    ],
  },
  PRO: {
    ngn: 85550,
    usd: 59,
    displayName: "Pro",
    features: [
      "Invoices: 300 / month",
      "WhatsApp messages: 1,000 / month",
      "AI usage: 300 / month",
      "Automations: 10 total",
      "Up to 3 team members",
    ],
  },
  GROWTH: {
    ngn: 172550,
    usd: 119,
    displayName: "Growth",
    features: [
      "Invoices: 1,000 / month",
      "WhatsApp messages: 3,000 / month",
      "AI usage: 1,000 / month",
      "Automations: 25 total",
      "Up to 5 team members",
      "Priority support",
    ],
  },
  BUSINESS: businessMeta,
  PREMIUM: businessMeta,
  ENTERPRISE: {
    displayName: "Enterprise",
    features: [
      "Unlimited invoices",
      "Unlimited WhatsApp (fair-use)",
      "Unlimited AI",
      "Unlimited team members",
      "Dedicated account manager",
      "SLA & custom integrations",
    ],
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
  if (currency.toUpperCase() === "USD" && data.usd != null) {
    return data.usd;
  }
  const ngn = data.ngn ?? null;
  if (!ngn) return null;
  const rate = FX_RATES_NGN_PER[currency.toUpperCase()] ?? FX_RATES_NGN_PER.NGN;
  const base = ngn / rate;
  const { total } = applyVatToSubtotal(base, STANDARD_VAT_RATE);
  return Math.round(total * 100) / 100;
}

export function getPlanPriceForInterval(
  plan: Plan,
  currency: string,
  interval: BillingInterval
) {
  const monthly = getPlanPriceForCurrency(plan, currency);
  if (monthly == null) return null;
  if (interval === "yearly") {
    const yearly = monthly * 12 * 0.9;
    return Math.round(yearly * 100) / 100;
  }
  return monthly;
}

export function getPlanFromAmountWithInterval(currency: string, amount: number) {
  const normalized = currency.toUpperCase();
  const ordered: Plan[] = ["STARTER", "PRO", "GROWTH", "BUSINESS", "ENTERPRISE"];
  for (const plan of ordered) {
    const monthly = getPlanPriceForCurrency(plan, normalized);
    if (monthly != null && Math.abs(monthly - amount) < 0.01) {
      return { plan, interval: "monthly" as const };
    }
    const yearly = getPlanPriceForInterval(plan, normalized, "yearly");
    if (yearly != null && Math.abs(yearly - amount) < 0.01) {
      return { plan, interval: "yearly" as const };
    }
  }
  return null;
}

export function getPlanFromAmount(currency: string, amount: number) {
  const match = getPlanFromAmountWithInterval(currency, amount);
  return match?.plan ?? null;
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
  const ordered: Plan[] = ["STARTER", "PRO", "GROWTH", "BUSINESS", "ENTERPRISE"];
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
  const ordered: Plan[] = ["STARTER", "PRO", "GROWTH", "BUSINESS", "ENTERPRISE"];
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

export function getPlanMeta(plan: string) {
  const normalized = String(plan || "").toUpperCase() as Plan;
  const meta = pricingTable[normalized];
  if (!meta) return null;
  return {
    plan: normalized,
    label: meta.displayName,
    features: meta.features,
  };
}
