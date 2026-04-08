import "server-only";

import { unstable_cache } from "next/cache";
import {
  FX_RATES_NGN_PER,
  getPlanMeta,
  getPlanUsdPrice,
  PRICING_PLAN_ORDER,
  type BillingInterval,
  type Plan,
} from "@/lib/pricing";
import {
  type PricingPriceEntry,
} from "@/lib/pricing-price-book";
import { getStripeSupportedCurrencies, normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { getEnabledCheckoutProviders } from "@/lib/payments/payment-providers";
import { getPresentmentPricingCurrencies } from "@/lib/pricing-presentment";
import { roundPricingDisplayAmount } from "@/lib/pricing-rounding";

type FxSnapshot = {
  asOf: string | null;
  base: string;
  rates: Record<string, number>;
  source: "frankfurter" | "static-fallback";
};

function getSnapshotSupportedCurrencies(snapshot: FxSnapshot) {
  return Object.keys(snapshot.rates)
    .map((currency) => normalizeCurrency(currency))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function getPlanPriceForCurrencyFromSnapshot(
  plan: Plan,
  currency: string,
  snapshot: FxSnapshot
) {
  const normalizedCurrency = normalizeCurrency(currency);
  const usdPrice = getPlanUsdPrice(plan);
  if (usdPrice == null) return null;
  if (normalizedCurrency === "USD") return usdPrice;

  const rate = snapshot.rates[normalizedCurrency] ?? STATIC_USD_RATES[normalizedCurrency];
  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  return roundPricingDisplayAmount(usdPrice * rate);
}

function getPlanPriceForIntervalFromSnapshot(
  plan: Plan,
  currency: string,
  interval: BillingInterval,
  snapshot: FxSnapshot
) {
  const monthly = getPlanPriceForCurrencyFromSnapshot(plan, currency, snapshot);
  if (monthly == null) return null;
  if (interval === "yearly") {
    return roundPricingDisplayAmount(monthly * 12 * 0.85);
  }
  return monthly;
}

function buildStaticUsdRates() {
  const usdPerUsd = 1;
  const ngnPerUsd = FX_RATES_NGN_PER.USD;
  const derived = Object.entries(FX_RATES_NGN_PER).map(([currency, ngnPerCurrency]) => {
    if (!Number.isFinite(ngnPerCurrency) || ngnPerCurrency <= 0) {
      return [currency, null] as const;
    }
    if (currency === "USD") {
      return [currency, usdPerUsd] as const;
    }
    return [currency, ngnPerUsd / ngnPerCurrency] as const;
  });

  return Object.fromEntries(
    derived.filter((entry): entry is [string, number] => Number.isFinite(entry[1] ?? NaN))
  );
}

const STATIC_USD_RATES = buildStaticUsdRates();

const getCachedFxSnapshot = unstable_cache(
  async (): Promise<FxSnapshot> => {
    const symbols = getStripeSupportedCurrencies()
      .filter((currency) => currency !== "USD")
      .sort()
      .join(",");

    const response = await fetch(
      `https://api.frankfurter.app/latest?base=USD&symbols=${encodeURIComponent(symbols)}`,
      {
        headers: { accept: "application/json" },
        next: { revalidate: 60 * 60 * 12 },
      }
    );

    if (!response.ok) {
      throw new Error(`FX request failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      amount?: number;
      base?: string;
      date?: string;
      rates?: Record<string, number>;
    };
    const normalizedRates: Record<string, number> = { USD: 1 };

    for (const [currency, rate] of Object.entries(payload.rates || {})) {
      if (Number.isFinite(rate) && rate > 0) {
        normalizedRates[normalizeCurrency(currency)] = rate;
      }
    }

    return {
      asOf: payload.date || null,
      base: normalizeCurrency(payload.base || "USD"),
      rates: normalizedRates,
      source: "frankfurter",
    };
  },
  ["pricing-live-fx-v1"],
  { revalidate: 60 * 60 * 12 }
);

export async function getLiveFxSnapshot(): Promise<FxSnapshot> {
  try {
    return await getCachedFxSnapshot();
  } catch {
    return {
      asOf: null,
      base: "USD",
      rates: STATIC_USD_RATES,
      source: "static-fallback",
    };
  }
}

export async function getPricingSupportedCurrencies() {
  const snapshot = await getLiveFxSnapshot();
  return getPresentmentPricingCurrencies({
    enabledProviders: getEnabledCheckoutProviders(),
    snapshotCurrencies: getSnapshotSupportedCurrencies(snapshot),
  });
}

export async function getPlanPriceForCurrencyLive(plan: Plan, currency: string) {
  const snapshot = await getLiveFxSnapshot();
  return getPlanPriceForCurrencyFromSnapshot(plan, currency, snapshot);
}

export async function getPlanPriceForIntervalLive(
  plan: Plan,
  currency: string,
  interval: BillingInterval
) {
  const snapshot = await getLiveFxSnapshot();
  return getPlanPriceForIntervalFromSnapshot(plan, currency, interval, snapshot);
}

export async function buildPricingPriceBook() {
  const snapshot = await getLiveFxSnapshot();
  const currencies = getPresentmentPricingCurrencies({
    enabledProviders: getEnabledCheckoutProviders(),
    snapshotCurrencies: getSnapshotSupportedCurrencies(snapshot),
  });

  return Object.fromEntries(
    currencies.map((currency) => [
      currency,
      Object.fromEntries(
        PRICING_PLAN_ORDER.map((plan) => [
          plan,
          {
            monthly: getPlanPriceForIntervalFromSnapshot(plan, currency, "monthly", snapshot),
            yearly: getPlanPriceForIntervalFromSnapshot(plan, currency, "yearly", snapshot),
          } satisfies PricingPriceEntry,
        ])
      ),
    ])
  );
}

export async function buildPricingPlansForDisplay() {
  const priceBook = await buildPricingPriceBook();

  return PRICING_PLAN_ORDER.map((plan) => {
    const meta = getPlanMeta(plan);
    return {
      plan,
      label: meta?.label || plan,
      features: meta?.features || [],
      prices: Object.fromEntries(
        Object.entries(priceBook).map(([currency, plans]) => [
          currency,
          plans[plan] || { monthly: null, yearly: null },
        ])
      ),
    };
  });
}

export async function getPlanFromAmountWithIntervalLive(currency: string, amount: number) {
  const normalizedCurrency = normalizeCurrency(currency);

  for (const plan of PRICING_PLAN_ORDER) {
    const monthly = await getPlanPriceForIntervalLive(plan, normalizedCurrency, "monthly");
    if (monthly != null && Math.abs(monthly - amount) < 0.01) {
      return { plan, interval: "monthly" as const };
    }

    const yearly = await getPlanPriceForIntervalLive(plan, normalizedCurrency, "yearly");
    if (yearly != null && Math.abs(yearly - amount) < 0.01) {
      return { plan, interval: "yearly" as const };
    }
  }

  return null;
}
