import { allowedCurrencies, normalizeCurrency } from "./payments/currency-allowlist";

export const SUPPORTED_COUNTRY_CODES = [
  "NG",
  "GH",
  "KE",
  "ZA",
  "CI",
  "EG",
  "RW",
  "UG",
  "TZ",
  "ZM",
  "MZ",
] as const;

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
  return SUPPORTED_COUNTRY_CODES.includes(
    normalized as (typeof SUPPORTED_COUNTRY_CODES)[number]
  );
}
