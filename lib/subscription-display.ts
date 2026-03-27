import type { PaymentProvider, SubscriptionStatus } from "@prisma/client";

function normalizeProvider(value: string | null | undefined): PaymentProvider | null {
  const provider = String(value || "").trim().toUpperCase();
  if (provider === "STRIPE" || provider === "PAYSTACK" || provider === "FLUTTERWAVE") {
    return provider as PaymentProvider;
  }
  return null;
}

export function resolveSubscriptionManagementProvider(input: {
  provider?: string | null;
  lastPaymentProvider?: string | null;
  orgProvider?: string | null;
}) {
  return (
    normalizeProvider(input.provider) ??
    normalizeProvider(input.lastPaymentProvider) ??
    normalizeProvider(input.orgProvider) ??
    null
  );
}

export function resolveSubscriptionDisplayRenewalDate(input: {
  renewalDate?: Date | null;
  paidThroughAt?: Date | null;
  currentCycleEndAt?: Date | null;
}) {
  return input.paidThroughAt ?? input.renewalDate ?? input.currentCycleEndAt ?? null;
}

export function resolveSubscriptionDisplayStatus(
  status: string | null | undefined,
  renewalDate: Date | null | undefined,
  now = new Date()
): SubscriptionStatus {
  const normalized = String(status || "").toUpperCase();
  const mapped: SubscriptionStatus =
    normalized === "PAST_DUE"
      ? "PAST_DUE"
      : normalized === "TRIALING"
        ? "TRIALING"
        : normalized === "CANCELED" || normalized === "INACTIVE" || normalized === "REVOKED"
          ? "CANCELED"
          : "ACTIVE";

  if (
    renewalDate &&
    (mapped === "ACTIVE" || mapped === "TRIALING") &&
    renewalDate.getTime() < now.getTime()
  ) {
    return "PAST_DUE";
  }

  return mapped;
}
