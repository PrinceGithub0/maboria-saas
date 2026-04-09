import { getBusinessCurrencyName } from "../business-currencies";

const fallbackAllowedCurrencies = [
  "USD",
  "EUR",
  "GBP",
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "XOF",
  "UGX",
  "TZS",
  "RWF",
  "ZMW",
  "MZN",
  "EGP",
] as const;

const stripeSupportedCurrencies =
  typeof Intl.supportedValuesOf === "function"
    ? Array.from(
        new Set(
          Intl.supportedValuesOf("currency").map((code) =>
            String(code || "").trim().toUpperCase()
          )
        )
      ).sort()
    : [...fallbackAllowedCurrencies];

export const allowedCurrencies = [...stripeSupportedCurrencies];

export const providerSupport: Record<"PAYSTACK" | "FLUTTERWAVE" | "STRIPE", string[]> = {
  PAYSTACK: ["NGN", "GHS", "KES", "ZAR", "XOF"],
  FLUTTERWAVE: ["NGN", "USD", "GHS", "KES", "ZAR", "XOF", "UGX", "TZS", "RWF", "ZMW", "MZN", "EGP", "GBP", "EUR"],
  STRIPE: stripeSupportedCurrencies,
};

export const currencyMinorUnits = {
  BHD: 3,
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  NGN: 2,
  USD: 2,
  GHS: 2,
  IQD: 3,
  JOD: 3,
  JPY: 0,
  KES: 2,
  KMF: 0,
  KRW: 0,
  KWD: 3,
  LYD: 3,
  MGA: 0,
  OMR: 3,
  PYG: 0,
  RWF: 0,
  TND: 3,
  ZAR: 2,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XOF: 0,
  TZS: 0,
  ZMW: 2,
  MZN: 2,
  EGP: 2,
  GBP: 2,
  EUR: 2,
  XAF: 0,
  XPF: 0,
} as const;

export function normalizeCurrency(value: string) {
  return String(value || "").trim().toUpperCase();
}

export function getCurrencyDisplayName(code: string, locale = "en") {
  const normalized = normalizeCurrency(code);
  const staticName = getBusinessCurrencyName(normalized, locale);
  if (staticName && staticName !== normalized) {
    return staticName;
  }
  try {
    const name = new Intl.DisplayNames([locale || "en"], { type: "currency" }).of(normalized);
    return name ? name[0].toUpperCase() + name.slice(1) : normalized;
  } catch {
    return normalized;
  }
}

export function formatCurrencyOption(code: string, locale = "en") {
  const normalized = normalizeCurrency(code);
  const name = getCurrencyDisplayName(normalized, locale);
  return name && name !== normalized ? `${normalized} \u00B7 ${name}` : normalized;
}

export function isAllowedCurrency(value: string) {
  const normalized = normalizeCurrency(value);
  return allowedCurrencies.includes(normalized as (typeof allowedCurrencies)[number]);
}

export function getStripeSupportedCurrencies() {
  return [...stripeSupportedCurrencies];
}

export function isStripeSupportedCurrency(value: string) {
  const normalized = normalizeCurrency(value);
  return stripeSupportedCurrencies.includes(normalized);
}

export function isProviderCurrency(provider: keyof typeof providerSupport, currency: string) {
  const normalized = normalizeCurrency(currency);
  return providerSupport[provider].some((code) => code === normalized);
}

export function getPaystackEnabledCurrencies() {
  const raw =
    process.env.PAYSTACK_ENABLED_CURRENCIES ||
    process.env.NEXT_PUBLIC_PAYSTACK_ENABLED_CURRENCIES;
  const fromEnv = raw
    ? raw
        .split(",")
        .map((code) => normalizeCurrency(code))
        .filter((code) => isAllowedCurrency(code) && isProviderCurrency("PAYSTACK", code))
    : [];
  return fromEnv.length > 0 ? fromEnv : ["NGN"];
}

export function isPaystackCurrencyEnabled(currency: string) {
  const normalized = normalizeCurrency(currency);
  return getPaystackEnabledCurrencies().includes(normalized);
}

export function toMinorUnits(amount: number, currency: string) {
  const normalized = normalizeCurrency(currency);
  const decimals =
    currencyMinorUnits[normalized as keyof typeof currencyMinorUnits] ?? 2;
  if (!Number.isFinite(amount)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor);
}

export function fromMinorUnits(amount: number, currency: string) {
  const normalized = normalizeCurrency(currency);
  const decimals =
    currencyMinorUnits[normalized as keyof typeof currencyMinorUnits] ?? 2;
  if (!Number.isFinite(amount)) return 0;
  const factor = Math.pow(10, decimals);
  return amount / factor;
}
