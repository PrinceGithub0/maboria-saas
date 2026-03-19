import { BUSINESS_CURRENCIES, isSupportedBusinessCurrency as isKnownBusinessCurrency } from "./business-currencies";
import { normalizeCurrency } from "./payments/currency-allowlist";
import { countryCodes } from "./countries";

export const SUPPORTED_BUSINESS_CURRENCIES = BUSINESS_CURRENCIES;

export function isSupportedBusinessCurrency(value: string) {
  return isKnownBusinessCurrency(normalizeCurrency(value));
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

export function requiresBusinessTaxId(vatEnabled?: boolean | null) {
  return Boolean(vatEnabled);
}

export function hasRequiredBusinessTaxId(input: { vatEnabled?: boolean | null; taxId?: string | null }) {
  if (!requiresBusinessTaxId(input.vatEnabled)) return true;
  return Boolean(String(input.taxId || "").trim());
}

export function normalizeBusinessTaxId(input: { vatEnabled?: boolean | null; taxId?: string | null }) {
  if (!requiresBusinessTaxId(input.vatEnabled)) return null;
  const trimmed = String(input.taxId || "").trim();
  return trimmed || null;
}
