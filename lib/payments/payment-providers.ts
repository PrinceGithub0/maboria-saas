import type { PaymentProvider } from "@prisma/client";

export const PAYSTACK_COUNTRIES = ["NG", "GH", "ZA", "KE", "CI"] as const;
export const FLUTTERWAVE_COUNTRIES = [
  "NG",
  "US",
  "GH",
  "KE",
  "ZA",
  "CI",
  "UG",
  "TZ",
  "RW",
  "ZM",
  "MZ",
  "EG",
  "GB",
] as const;
export const FLUTTERWAVE_REGIONS = ["SEPA Europe"] as const;
export const CHECKOUT_PROVIDER_VALUES = ["PAYSTACK", "FLUTTERWAVE", "STRIPE"] as const;
export const SUBSCRIPTION_CHECKOUT_PROVIDER_VALUES = CHECKOUT_PROVIDER_VALUES;
export const PAYOUT_PROVIDER_VALUES = ["PAYSTACK", "FLUTTERWAVE"] as const;

export type CheckoutProvider = (typeof CHECKOUT_PROVIDER_VALUES)[number];
export type SubscriptionCheckoutProvider = (typeof SUBSCRIPTION_CHECKOUT_PROVIDER_VALUES)[number];
export type PayoutProvider = (typeof PAYOUT_PROVIDER_VALUES)[number];

const DEFAULT_PROVIDER_PRIORITY: CheckoutProvider[] = ["PAYSTACK", "FLUTTERWAVE", "STRIPE"];

const paystackCountrySet = new Set<string>(PAYSTACK_COUNTRIES);
const checkoutProviderSet = new Set<string>(CHECKOUT_PROVIDER_VALUES);
const subscriptionCheckoutProviderSet = new Set<string>(SUBSCRIPTION_CHECKOUT_PROVIDER_VALUES);
const payoutProviderSet = new Set<string>(PAYOUT_PROVIDER_VALUES);

export function normalizeCountryCode(value: string | null | undefined) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return normalized;
}

export function isCheckoutProvider(value: string | null | undefined): value is CheckoutProvider {
  return checkoutProviderSet.has(String(value || "").trim().toUpperCase());
}

export function isPayoutProvider(value: string | null | undefined): value is PayoutProvider {
  return payoutProviderSet.has(String(value || "").trim().toUpperCase());
}

export function isSubscriptionCheckoutProvider(
  value: string | null | undefined
): value is SubscriptionCheckoutProvider {
  return subscriptionCheckoutProviderSet.has(String(value || "").trim().toUpperCase());
}

export function formatPaymentProviderLabel(value: string | null | undefined) {
  const provider = String(value || "").trim().toUpperCase();
  if (provider === "PAYSTACK") return "Paystack";
  if (provider === "FLUTTERWAVE") return "Flutterwave";
  if (provider === "STRIPE") return "Stripe";
  return provider || "--";
}

export function isStripeCheckoutConfigured() {
  return Boolean(
    String(process.env.STRIPE_SECRET_KEY || "").trim() &&
      String(process.env.STRIPE_WEBHOOK_SECRET || "").trim() &&
      String(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
          process.env.STRIPE_PUBLISHABLE_KEY ||
          ""
      ).trim()
  );
}

export function isStripeCheckoutConfiguredClient() {
  return Boolean(String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").trim());
}

export function isCheckoutProviderEnabled(provider: CheckoutProvider) {
  if (provider === "STRIPE") return isStripeCheckoutConfigured();
  return true;
}

export function getClientEnabledCheckoutProviders() {
  return CHECKOUT_PROVIDER_VALUES.filter((provider) =>
    provider === "STRIPE" ? isStripeCheckoutConfiguredClient() : true
  );
}

export function getEnabledSubscriptionCheckoutProviders() {
  return getEnabledCheckoutProviders();
}

export function getClientEnabledSubscriptionCheckoutProviders() {
  return getClientEnabledCheckoutProviders();
}

function parseProviderPriority(raw: string | undefined) {
  const configured = String(raw || "")
    .split(",")
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(isCheckoutProvider);

  if (configured.length === 0) {
    return DEFAULT_PROVIDER_PRIORITY;
  }

  return configured.filter((provider, index) => configured.indexOf(provider) === index);
}

function providerMatchesCountry(provider: CheckoutProvider, countryCode: string | null) {
  if (provider !== "PAYSTACK") return true;
  return Boolean(countryCode && paystackCountrySet.has(countryCode));
}

export function getEnabledCheckoutProviders() {
  return parseProviderPriority(process.env.PAYMENT_PROVIDER_PRIORITY).filter(
    isCheckoutProviderEnabled
  );
}

export function getEnabledPayoutProviders() {
  return [...PAYOUT_PROVIDER_VALUES];
}

export function resolveSubscriptionPaymentProvider(
  preferredProvider?: CheckoutProvider | null
): SubscriptionCheckoutProvider {
  return resolvePaymentProvider(null, preferredProvider);
}

export function getSubscriptionCheckoutFallbackProviders(
  primaryProvider: SubscriptionCheckoutProvider
) {
  return getCheckoutFallbackProviders(primaryProvider);
}

export function resolvePaymentProvider(
  countryCode: string | null | undefined,
  preferredProvider?: CheckoutProvider | null
): CheckoutProvider {
  const normalized = normalizeCountryCode(countryCode);
  const enabledProviders = getEnabledCheckoutProviders();

  if (
    preferredProvider &&
    isCheckoutProvider(preferredProvider) &&
    isCheckoutProviderEnabled(preferredProvider) &&
    providerMatchesCountry(preferredProvider, normalized)
  ) {
    return preferredProvider;
  }

  const countryMatched = enabledProviders.find((provider) =>
    providerMatchesCountry(provider, normalized)
  );
  return countryMatched || enabledProviders[0] || "FLUTTERWAVE";
}

export function getCheckoutFallbackProviders(
  primaryProvider: CheckoutProvider,
  countryCode?: string | null
) {
  const normalized = normalizeCountryCode(countryCode);
  return getEnabledCheckoutProviders().filter(
    (provider) =>
      provider !== primaryProvider && providerMatchesCountry(provider, normalized)
  );
}

export function toPaymentProviderEnum(provider: CheckoutProvider): PaymentProvider {
  return provider;
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
