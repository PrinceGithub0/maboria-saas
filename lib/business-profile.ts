import { allowedCurrencies, normalizeCurrency } from "./payments/currency-allowlist";
import { countryCodes } from "./countries";

export const SUPPORTED_BUSINESS_CURRENCIES = allowedCurrencies;

export function isSupportedBusinessCurrency(value: string) {
  const normalized = normalizeCurrency(value);
  return allowedCurrencies.includes(normalized as (typeof allowedCurrencies)[number]);
}

export function normalizeCountryCode(value: string) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeCurrencyCode(value: string) {
  return normalizeCurrency(value);
}

export function isSupportedCountry(value: string) {
  const normalized = normalizeCountryCode(value);
  return countryCodes.includes(normalized);
}
