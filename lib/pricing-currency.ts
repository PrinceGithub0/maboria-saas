import {
  allowedCurrencies,
  formatCurrencyOption,
  isAllowedCurrency,
  normalizeCurrency,
} from "@/lib/payments/currency-allowlist";
import { normalizeCountryCode } from "@/lib/payments/payment-providers";

export const PRICING_CURRENCY_COOKIE = "maboria_pricing_currency";

const preferredCurrencyOrder = [
  "USD",
  "EUR",
  "GBP",
] as const;

const pricingDisplayCurrencySet = new Set(allowedCurrencies);

const euroCountries = new Set([
  "AD",
  "AT",
  "AX",
  "BE",
  "BL",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GF",
  "GP",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MC",
  "ME",
  "MF",
  "MQ",
  "MT",
  "NL",
  "PM",
  "PT",
  "RE",
  "SI",
  "SK",
  "SM",
  "VA",
  "XK",
  "YT",
]);

const westAfricaFrancCountries = new Set([
  "BJ",
  "BF",
  "CI",
  "GW",
  "ML",
  "NE",
  "SN",
  "TG",
]);

const centralAfricaFrancCountries = new Set([
  "CM",
  "CF",
  "CG",
  "GA",
  "GQ",
  "TD",
]);

const countryCurrencyOverrides: Record<string, string> = {
  AU: "AUD",
  BR: "BRL",
  CA: "CAD",
  CH: "CHF",
  CN: "CNY",
  CI: "XOF",
  CZ: "CZK",
  DK: "DKK",
  EG: "EGP",
  GB: "GBP",
  GH: "GHS",
  HK: "HKD",
  HU: "HUF",
  ID: "IDR",
  IL: "ILS",
  IN: "INR",
  JP: "JPY",
  KE: "KES",
  MX: "MXN",
  MZ: "MZN",
  NG: "NGN",
  NO: "NOK",
  NZ: "NZD",
  PH: "PHP",
  PL: "PLN",
  RO: "RON",
  RW: "RWF",
  SE: "SEK",
  SG: "SGD",
  TH: "THB",
  TR: "TRY",
  TZ: "TZS",
  UG: "UGX",
  US: "USD",
  ZA: "ZAR",
  ZM: "ZMW",
};

function getSupportedPricingCurrencySet(supportedCurrencies?: readonly string[]) {
  if (!supportedCurrencies || supportedCurrencies.length === 0) {
    return pricingDisplayCurrencySet;
  }

  return new Set(
    supportedCurrencies
      .map((currency) => normalizeCurrency(currency))
      .filter(Boolean)
  );
}

export function isPricingDisplayCurrency(
  value: string | null | undefined,
  supportedCurrencies?: readonly string[]
) {
  const normalized = normalizeCurrency(value || "");
  return getSupportedPricingCurrencySet(supportedCurrencies).has(normalized);
}

export function getPricingDisplayCurrencies(supportedCurrencies?: readonly string[]) {
  const supported = Array.from(getSupportedPricingCurrencySet(supportedCurrencies));
  const preferred = preferredCurrencyOrder.filter((currency) =>
    supported.includes(currency)
  ) as string[];
  const preferredSet = new Set(preferred);
  const remaining = supported
    .filter((currency) => !preferredSet.has(currency))
    .sort((a, b) => a.localeCompare(b));
  return [...preferred, ...remaining];
}

export function getPricingCurrencyOptions(
  currentCurrency?: string | null,
  supportedCurrencies?: readonly string[],
  locale = "en"
) {
  void currentCurrency;
  const ordered = getPricingDisplayCurrencies(supportedCurrencies);

  return ordered.map((code) => ({
    code,
    label: formatCurrencyOption(code, locale),
  }));
}

export function getCurrencyFromCountryCode(countryCode: string | null | undefined) {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return null;
  if (countryCurrencyOverrides[normalized]) return countryCurrencyOverrides[normalized];
  if (westAfricaFrancCountries.has(normalized)) return "XOF";
  if (centralAfricaFrancCountries.has(normalized)) return "XAF";
  if (euroCountries.has(normalized)) return "EUR";
  return null;
}

function extractCountryFromLocaleTag(tag: string) {
  const normalized = String(tag || "").trim();
  if (!normalized) return null;
  const parts = normalized.replace(/_/g, "-").split("-");
  for (const part of parts.slice(1)) {
    const maybeCountry = normalizeCountryCode(part);
    if (maybeCountry) return maybeCountry;
  }
  return null;
}

export function getCurrencyFromAcceptLanguageHeader(value: string | null | undefined) {
  const header = String(value || "").trim();
  if (!header) return null;

  const tokens = header
    .split(",")
    .map((item) => item.split(";")[0]?.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const countryFromTag = extractCountryFromLocaleTag(token);
    const fromCountry = getCurrencyFromCountryCode(countryFromTag);
    if (fromCountry) return fromCountry;
  }

  return null;
}

export function resolveInitialPricingCurrency(input: {
  cookieValue?: string | null;
  preferredCurrency?: string | null;
  countryCode?: string | null;
  acceptLanguage?: string | null;
  supportedCurrencies?: readonly string[];
}) {
  const explicitCandidates = [input.cookieValue, input.preferredCurrency];

  for (const candidate of explicitCandidates) {
    const normalized = normalizeCurrency(candidate || "");
    if (
      isAllowedCurrency(normalized) &&
      isPricingDisplayCurrency(normalized, input.supportedCurrencies)
    ) {
      return normalized;
    }
  }

  const fromCountry = getCurrencyFromCountryCode(input.countryCode);
  if (fromCountry && isPricingDisplayCurrency(fromCountry, input.supportedCurrencies)) {
    return fromCountry;
  }

  const fromAcceptLanguage = getCurrencyFromAcceptLanguageHeader(input.acceptLanguage);
  if (
    fromAcceptLanguage &&
    isPricingDisplayCurrency(fromAcceptLanguage, input.supportedCurrencies)
  ) {
    return fromAcceptLanguage;
  }

  const preferredFallback = getPricingDisplayCurrencies(input.supportedCurrencies)[0];
  return preferredFallback || "USD";
}
