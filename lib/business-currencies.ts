import { countryCodes, getCountryFlag } from "./countries";
import { normalizeCurrency } from "./payments/currency-allowlist";

export const BUSINESS_CURRENCIES = [
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "ANG",
  "AOA",
  "ARS",
  "AUD",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BGN",
  "BHD",
  "BIF",
  "BMD",
  "BND",
  "BOB",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BYN",
  "BZD",
  "CAD",
  "CDF",
  "CHF",
  "CLP",
  "CNY",
  "COP",
  "CRC",
  "CUC",
  "CUP",
  "CVE",
  "CZK",
  "DJF",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "EUR",
  "FJD",
  "FKP",
  "GBP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GNF",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HRK",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "IQD",
  "IRR",
  "ISK",
  "JMD",
  "JOD",
  "JPY",
  "KES",
  "KGS",
  "KHR",
  "KMF",
  "KPW",
  "KRW",
  "KWD",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "LYD",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRU",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "OMR",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "PYG",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "RWF",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLE",
  "SLL",
  "SOS",
  "SRD",
  "SSP",
  "STN",
  "SVC",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TND",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "UGX",
  "USD",
  "UYU",
  "UZS",
  "VES",
  "VND",
  "VUV",
  "WST",
  "XAF",
  "XCD",
  "XCG",
  "XDR",
  "XOF",
  "XPF",
  "XSU",
  "YER",
  "ZAR",
  "ZMW",
  "ZWG",
  "ZWL",
] as const;

type BusinessCurrencyCode = (typeof BUSINESS_CURRENCIES)[number];

const businessCurrencySet = new Set<string>(BUSINESS_CURRENCIES);
const displayNamesCache = new Map<string, Intl.DisplayNames>();
const currencyFlagOverrides: Partial<Record<BusinessCurrencyCode, string>> = {
  ANG: "CW",
  EUR: "EU",
  GBP: "GB",
  XAF: "CM",
  XCD: "AG",
  XCG: "CW",
  XOF: "CI",
  XPF: "PF",
};

function getCurrencyDisplayNames(locale: string) {
  const normalizedLocale = locale || "en";
  const cached = displayNamesCache.get(normalizedLocale);
  if (cached) return cached;
  const displayNames = new Intl.DisplayNames([normalizedLocale], { type: "currency" });
  displayNamesCache.set(normalizedLocale, displayNames);
  return displayNames;
}

export function isSupportedBusinessCurrency(value: string): value is BusinessCurrencyCode {
  const normalized = normalizeCurrency(value);
  return businessCurrencySet.has(normalized);
}

export function getBusinessCurrencyName(code: string, locale = "en") {
  const normalized = normalizeCurrency(code);
  try {
    return getCurrencyDisplayNames(locale).of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

export function getBusinessCurrencyFlag(code: string) {
  const normalized = normalizeCurrency(code) as BusinessCurrencyCode;
  const override = currencyFlagOverrides[normalized];
  if (override) {
    return getCountryFlag(override);
  }
  const derivedCountryCode = normalized.slice(0, 2);
  if (countryCodes.includes(derivedCountryCode)) {
    return getCountryFlag(derivedCountryCode);
  }
  return "";
}

export function formatBusinessCurrencyOption(code: string, locale = "en") {
  const normalized = normalizeCurrency(code);
  const name = getBusinessCurrencyName(normalized, locale);
  return name && name !== normalized ? `${normalized} · ${name}` : normalized;
}
