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
  PAYSTACK: ["NGN"],
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

export function normalizeCurrency(value: string) {
  return String(value || "").trim().toUpperCase();
}

export function isAllowedCurrency(value: string) {
  const normalized = normalizeCurrency(value);
  return allowedCurrencies.includes(normalized as (typeof allowedCurrencies)[number]);
}

export function isProviderCurrency(provider: keyof typeof providerSupport, currency: string) {
  const normalized = normalizeCurrency(currency);
  return providerSupport[provider].includes(
    normalized as (typeof providerSupport)[keyof typeof providerSupport][number]
  );
}
