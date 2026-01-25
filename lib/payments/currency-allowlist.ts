import { getCountryFlag } from "@/lib/countries";

export const allowedCurrencies = [
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

const currencyFlagMap = {
  USD: getCountryFlag("US"),
  EUR: getCountryFlag("EU"),
  GBP: getCountryFlag("GB"),
  NGN: getCountryFlag("NG"),
  GHS: getCountryFlag("GH"),
  KES: getCountryFlag("KE"),
  ZAR: getCountryFlag("ZA"),
  XOF: getCountryFlag("CI"),
  UGX: getCountryFlag("UG"),
  TZS: getCountryFlag("TZ"),
  RWF: getCountryFlag("RW"),
  ZMW: getCountryFlag("ZM"),
  MZN: getCountryFlag("MZ"),
  EGP: getCountryFlag("EG"),
} as const;

export const providerSupport = {
  PAYSTACK: ["NGN", "GHS", "KES", "ZAR", "XOF"],
  FLUTTERWAVE: ["NGN", "USD", "GHS", "KES", "ZAR", "XOF", "UGX", "TZS", "RWF", "ZMW", "MZN", "EGP", "GBP", "EUR"],
} as const;

export const currencyMinorUnits = {
  NGN: 2,
  USD: 2,
  GHS: 2,
  KES: 2,
  ZAR: 2,
  XOF: 0,
  UGX: 0,
  TZS: 0,
  RWF: 0,
  ZMW: 2,
  MZN: 2,
  EGP: 2,
  GBP: 2,
  EUR: 2,
} as const;

export function normalizeCurrency(value: string) {
  return String(value || "").trim().toUpperCase();
}

export function formatCurrencyOption(code: string) {
  const normalized = normalizeCurrency(code);
  const flag = currencyFlagMap[normalized as keyof typeof currencyFlagMap];
  return flag ? `${flag} ${normalized}` : normalized;
}

export function isAllowedCurrency(value: string) {
  const normalized = normalizeCurrency(value);
  return allowedCurrencies.includes(normalized as (typeof allowedCurrencies)[number]);
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
