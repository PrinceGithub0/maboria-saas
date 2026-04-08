import { normalizeCurrency } from "@/lib/payments/currency-allowlist";

export type PricingPriceEntry = { monthly: number | null; yearly: number | null };

export type PricingPriceBook = Record<
  string,
  Record<string, PricingPriceEntry>
>;

export function getPricingPriceBookCurrencies(priceBook: PricingPriceBook) {
  return Object.keys(priceBook)
    .map((currency) => normalizeCurrency(currency))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}
