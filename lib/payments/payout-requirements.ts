import { isProviderCurrency, normalizeCurrency } from "./currency-allowlist";
import { normalizeCountryCode, type PayoutProvider } from "./payment-providers";
import { isSepaCountry } from "./sepa";

export const PAYSTACK_PAYOUT_COUNTRIES = ["NG", "GH", "ZA", "KE"] as const;
export const FLUTTERWAVE_BRANCH_CODE_COUNTRIES = ["GH", "TZ", "RW", "UG"] as const;
export const FLUTTERWAVE_ROUTING_NUMBER_COUNTRIES = ["US"] as const;
export const PAYOUT_DETAILS_KEYS = ["branchCode", "routingNumber", "sortCode"] as const;
export const PAYOUT_FIELD_KEYS = [
  "accountName",
  "bankCode",
  "accountNumber",
  "iban",
  "bicSwift",
  ...PAYOUT_DETAILS_KEYS,
] as const;

export type PayoutDetailsKey = (typeof PAYOUT_DETAILS_KEYS)[number];
export type PayoutFieldKey = (typeof PAYOUT_FIELD_KEYS)[number];
export type PayoutMode = "local" | "sepa";
export type PayoutHintCode =
  | "paystack_country_limited"
  | "provider_currency_unsupported"
  | "provider_country_unsupported"
  | "no_supported_provider"
  | "sepa_flutterwave_only"
  | "flutterwave_branch_code_required"
  | "flutterwave_us_routing_required"
  | "sepa_eur_only";

export type PayoutDetails = Partial<Record<PayoutDetailsKey, string>>;

export type ResolvedPayoutRequirements = {
  provider: PayoutProvider;
  country: string;
  currency: string;
  payoutType: PayoutMode;
  supported: boolean;
  providerLocked: boolean;
  bankListRequired: boolean;
  requiredFields: PayoutFieldKey[];
  optionalFields: PayoutFieldKey[];
  hints: PayoutHintCode[];
  unsupportedReason: PayoutHintCode | null;
};

const paystackPayoutCountrySet = new Set<string>(PAYSTACK_PAYOUT_COUNTRIES);
const flutterwaveBranchCodeCountrySet = new Set<string>(FLUTTERWAVE_BRANCH_CODE_COUNTRIES);
const flutterwaveRoutingCountrySet = new Set<string>(FLUTTERWAVE_ROUTING_NUMBER_COUNTRIES);

function trimValue(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function canUseSepa(provider: PayoutProvider, country: string, currency: string) {
  return provider === "FLUTTERWAVE" && currency === "EUR" && isSepaCountry(country);
}

export function sanitizePayoutDetails(input: unknown): PayoutDetails {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const source = input as Record<string, unknown>;
  const details: PayoutDetails = {};

  for (const key of PAYOUT_DETAILS_KEYS) {
    const trimmed = trimValue(typeof source[key] === "string" ? source[key] : null);
    if (trimmed) {
      details[key] = trimmed;
    }
  }

  return details;
}

export function resolvePayoutRequirements(input: {
  provider: PayoutProvider;
  country: string | null | undefined;
  currency: string | null | undefined;
}): ResolvedPayoutRequirements {
  const provider = input.provider;
  const country = normalizeCountryCode(input.country) || "NG";
  const currency = normalizeCurrency(input.currency || "NGN");
  const hints: PayoutHintCode[] = [];

  if (canUseSepa(provider, country, currency)) {
    hints.push("sepa_flutterwave_only");
    return {
      provider,
      country,
      currency: "EUR",
      payoutType: "sepa",
      supported: true,
      providerLocked: true,
      bankListRequired: false,
      requiredFields: ["accountName", "iban", "bicSwift"],
      optionalFields: [],
      hints,
      unsupportedReason: null,
    };
  }

  if (provider === "PAYSTACK") {
    if (!paystackPayoutCountrySet.has(country)) {
      return {
        provider,
        country,
        currency,
        payoutType: "local",
        supported: false,
        providerLocked: false,
        bankListRequired: true,
        requiredFields: ["accountName", "bankCode", "accountNumber"],
        optionalFields: [],
        hints: ["paystack_country_limited"],
        unsupportedReason: "provider_country_unsupported",
      };
    }

    if (!isProviderCurrency("PAYSTACK", currency)) {
      return {
        provider,
        country,
        currency,
        payoutType: "local",
        supported: false,
        providerLocked: false,
        bankListRequired: true,
        requiredFields: ["accountName", "bankCode", "accountNumber"],
        optionalFields: [],
        hints: ["provider_currency_unsupported"],
        unsupportedReason: "provider_currency_unsupported",
      };
    }

    return {
      provider,
      country,
      currency,
      payoutType: "local",
      supported: true,
      providerLocked: false,
      bankListRequired: true,
      requiredFields: ["accountName", "bankCode", "accountNumber"],
      optionalFields: [],
      hints: [],
      unsupportedReason: null,
    };
  }

  if (!isProviderCurrency("FLUTTERWAVE", currency)) {
    return {
      provider,
      country,
      currency,
      payoutType: "local",
      supported: false,
      providerLocked: false,
      bankListRequired: true,
      requiredFields: ["accountName", "bankCode", "accountNumber"],
      optionalFields: [],
      hints: ["provider_currency_unsupported"],
      unsupportedReason: "provider_currency_unsupported",
    };
  }

  const requiredFields: PayoutFieldKey[] = ["accountName", "bankCode", "accountNumber"];

  if (flutterwaveRoutingCountrySet.has(country)) {
    requiredFields.push("routingNumber", "bicSwift");
    hints.push("flutterwave_us_routing_required");
  } else if (flutterwaveBranchCodeCountrySet.has(country)) {
    requiredFields.push("branchCode");
    hints.push("flutterwave_branch_code_required");
  } else if (currency === "EUR" && isSepaCountry(country)) {
    hints.push("sepa_eur_only");
  }

  return {
    provider,
    country,
    currency,
    payoutType: "local",
    supported: true,
    providerLocked: false,
    bankListRequired: true,
    requiredFields,
    optionalFields: [],
    hints,
    unsupportedReason: null,
  };
}

export function getSupportedPayoutProviders(input: {
  country: string | null | undefined;
  currency: string | null | undefined;
}) {
  return (["PAYSTACK", "FLUTTERWAVE"] as const).filter((provider) =>
    resolvePayoutRequirements({ provider, country: input.country, currency: input.currency }).supported
  );
}

export function getPreferredPayoutProvider(input: {
  country: string | null | undefined;
  currency: string | null | undefined;
  preferredProvider?: PayoutProvider | null;
}) {
  const preferred = input.preferredProvider;
  if (preferred) {
    const preferredRequirements = resolvePayoutRequirements({
      provider: preferred,
      country: input.country,
      currency: input.currency,
    });
    if (preferredRequirements.supported) {
      return preferred;
    }
  }

  const supportedProviders = getSupportedPayoutProviders(input);
  return supportedProviders[0] || "FLUTTERWAVE";
}
