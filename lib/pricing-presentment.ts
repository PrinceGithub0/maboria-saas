import { FX_RATES_NGN_PER } from "@/lib/pricing";
import {
  normalizeCurrency,
  providerSupport,
} from "@/lib/payments/currency-allowlist";
import type { CheckoutProvider } from "@/lib/payments/payment-providers";

function uniqueSortedCurrencies(values: readonly string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeCurrency(value))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

export function getCheckoutSupportedCurrencies(
  providers: readonly CheckoutProvider[]
) {
  return uniqueSortedCurrencies(
    providers.flatMap((provider) => providerSupport[provider] || [])
  );
}

export function hasPricingRateSupport(
  currency: string,
  snapshotCurrencies: readonly string[]
) {
  const normalized = normalizeCurrency(currency);
  if (!normalized) return false;
  if (normalized === "USD") return true;
  if (snapshotCurrencies.includes(normalized)) return true;
  const fallbackRate = FX_RATES_NGN_PER[normalized];
  return Number.isFinite(fallbackRate) && fallbackRate > 0;
}

export function getPresentmentPricingCurrencies(input: {
  enabledProviders: readonly CheckoutProvider[];
  snapshotCurrencies: readonly string[];
}) {
  const checkoutCurrencies = getCheckoutSupportedCurrencies(input.enabledProviders);
  const snapshotCurrencies = uniqueSortedCurrencies(input.snapshotCurrencies);

  return checkoutCurrencies.filter((currency) =>
    hasPricingRateSupport(currency, snapshotCurrencies)
  );
}
