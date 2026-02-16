import type { PaymentProvider } from "@prisma/client";

export const PAYSTACK_COUNTRIES = [
  "NG", // Nigeria
  "GH", // Ghana
  "ZA", // South Africa
  "KE", // Kenya
  "CI", // Cote d'Ivoire
] as const;

type ResolvedProvider = "paystack" | "flutterwave";

const paystackCountrySet = new Set<string>(PAYSTACK_COUNTRIES);

export function normalizeCountryCode(value: string | null | undefined) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return normalized;
}

export function resolvePaymentProvider(countryCode: string | null | undefined): ResolvedProvider {
  const normalized = normalizeCountryCode(countryCode);
  if (normalized && paystackCountrySet.has(normalized)) {
    return "paystack";
  }
  return "flutterwave";
}

export function toPaymentProviderEnum(provider: ResolvedProvider): PaymentProvider {
  return provider === "paystack" ? "PAYSTACK" : "FLUTTERWAVE";
}

export function getCountryFromRequestHeaders(headers: Headers) {
  const candidates = [
    headers.get("x-billing-country"),
    headers.get("x-vercel-ip-country"),
    headers.get("cf-ipcountry"),
    headers.get("x-country-code"),
    headers.get("x-geo-country"),
  ];

  for (const value of candidates) {
    const normalized = normalizeCountryCode(value);
    if (normalized) return normalized;
  }

  return null;
}
