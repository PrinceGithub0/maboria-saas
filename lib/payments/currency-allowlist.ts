export const allowedCurrencies = [
  "NGN",
  "USD",
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
  "GBP",
  "EUR",
] as const;

export const providerSupport = {
  PAYSTACK: ["NGN", "GHS", "KES", "ZAR", "XOF"],
  FLUTTERWAVE: ["NGN", "USD", "GHS", "KES", "ZAR", "XOF", "UGX", "TZS", "RWF", "ZMW", "MZN", "EGP", "GBP", "EUR"],
} as const;

export const marketingCountries = {
  PAYSTACK: ["Nigeria", "Ghana", "Kenya", "South Africa", "Cote d'Ivoire"],
  FLUTTERWAVE: [
    "Nigeria",
    "Ghana",
    "Kenya",
    "South Africa",
    "Uganda",
    "Tanzania",
    "Rwanda",
    "Zambia",
    "Mozambique",
    "Egypt",
  ],
} as const;

export const currencyDisplay = {
  NGN: { country: "Nigeria", flag: "\u{1F1F3}\u{1F1EC}" },
  USD: { country: "United States", flag: "\u{1F1FA}\u{1F1F8}" },
  GHS: { country: "Ghana", flag: "\u{1F1EC}\u{1F1ED}" },
  KES: { country: "Kenya", flag: "\u{1F1F0}\u{1F1EA}" },
  ZAR: { country: "South Africa", flag: "\u{1F1FF}\u{1F1E6}" },
  XOF: { country: "Cote d'Ivoire", flag: "\u{1F1E8}\u{1F1EE}" },
  UGX: { country: "Uganda", flag: "\u{1F1FA}\u{1F1EC}" },
  TZS: { country: "Tanzania", flag: "\u{1F1F9}\u{1F1FF}" },
  RWF: { country: "Rwanda", flag: "\u{1F1F7}\u{1F1FC}" },
  ZMW: { country: "Zambia", flag: "\u{1F1FF}\u{1F1F2}" },
  MZN: { country: "Mozambique", flag: "\u{1F1F2}\u{1F1FF}" },
  EGP: { country: "Egypt", flag: "\u{1F1EA}\u{1F1EC}" },
  GBP: { country: "United Kingdom", flag: "\u{1F1EC}\u{1F1E7}" },
  EUR: { country: "Europe", flag: "\u{1F1EA}\u{1F1FA}" },
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
  const meta = currencyDisplay[normalized as keyof typeof currencyDisplay];
  if (!meta) return normalized;
  return `${meta.flag} ${normalized} (${meta.country})`;
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
