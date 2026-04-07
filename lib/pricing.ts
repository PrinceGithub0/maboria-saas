import { STANDARD_VAT_RATE, applyVatToSubtotal } from "./vat";

export type Plan = "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "PREMIUM" | "ENTERPRISE";
export type BillingInterval = "monthly" | "yearly";
type Currency = "USD" | "NGN";

type PricingMeta = { usd?: number; ngn?: number; displayName: string; features: string[] };

// Pricing is intentionally kept as a small, hardcoded table so UI can render without a DB dependency.
// "BUSINESS" is the canonical plan name; "PREMIUM" is kept as a legacy alias for older data.
const businessMeta: PricingMeta = {
  ngn: 506050,
  usd: 349,
  displayName: "Business",
  features: [
    "1 workspace",
    "Unlimited connections",
    "Advanced inbox operations",
    "Roles and permissions",
    "Audit logs",
    "Admin controls",
    "Advanced reporting",
    "Compliance and e-invoicing support",
    "Onboarding assistance",
    "Up to 15 seats",
  ],
};

const pricingTable: Record<Plan, PricingMeta> = {
  STARTER: {
    ngn: 56550,
    usd: 39,
    displayName: "Starter",
    features: [
      "1 workspace",
      "2 connections total",
      "Unified inbox",
      "Send invoices and track payments",
      "Automated follow-ups",
      "Basic workflows",
      "AI assistant",
      "1 seat",
    ],
  },
  PRO: {
    ngn: 114550,
    usd: 79,
    displayName: "Pro",
    features: [
      "1 workspace",
      "Up to 8 connections",
      "Shared inbox",
      "Smart automation workflows",
      "AI-powered replies",
      "Payment tracking",
      "Exports",
      "Role-based access",
      "3 seats",
    ],
  },
  GROWTH: {
    ngn: 245050,
    usd: 169,
    displayName: "Growth",
    features: [
      "1 workspace",
      "Up to 20 connections",
      "Multiple connected inboxes",
      "Advanced routing and assignment",
      "Reporting and team visibility",
      "Longer history retention",
      "Priority support",
      "Up to 8 seats",
    ],
  },
  BUSINESS: businessMeta,
  PREMIUM: businessMeta,
  ENTERPRISE: {
    displayName: "Enterprise",
    features: [
      "Custom throughput",
      "SLA guarantee",
      "Custom integrations",
      "Dedicated support",
      "Compliance rollout assistance",
      "Negotiated limits and controls",
      "Custom seat volume",
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
  if (ngn == null) return null;
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
    const yearly = monthly * 12 * 0.85;
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
