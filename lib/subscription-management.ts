export type SubscriptionStateSource = "subscription" | "org_subscription" | "none";
export type SubscriptionBillingMode = "provider_portal" | "provider_external" | "unmanaged";

export type SubscriptionManagementState = {
  provider: string | null;
  stateSource: SubscriptionStateSource;
  billingMode: SubscriptionBillingMode;
  portalPath: string | null;
  canManageAutoRenewInApp: boolean;
  canScheduleDowngradeInApp: boolean;
};

export function deriveSubscriptionManagement(input: {
  provider?: string | null;
  providerCustomerId?: string | null;
  hasReusablePaymentMethod?: boolean;
  stateSource: SubscriptionStateSource;
}): SubscriptionManagementState {
  const provider = String(input.provider || "").trim().toUpperCase() || null;

  if (provider === "STRIPE" && input.providerCustomerId) {
    return {
      provider,
      stateSource: input.stateSource,
      billingMode: "provider_portal",
      portalPath: "/api/payments/stripe/portal",
      canManageAutoRenewInApp: false,
      canScheduleDowngradeInApp: false,
    };
  }

  if (provider) {
    if (provider === "FLUTTERWAVE" && input.hasReusablePaymentMethod) {
      return {
        provider,
        stateSource: input.stateSource,
        billingMode: "unmanaged",
        portalPath: null,
        canManageAutoRenewInApp: true,
        canScheduleDowngradeInApp: true,
      };
    }

    return {
      provider,
      stateSource: input.stateSource,
      billingMode: "provider_external",
      portalPath: null,
      canManageAutoRenewInApp: false,
      canScheduleDowngradeInApp: false,
    };
  }

  return {
    provider: null,
    stateSource: input.stateSource,
    billingMode: "unmanaged",
    portalPath: null,
    canManageAutoRenewInApp: true,
    canScheduleDowngradeInApp: true,
  };
}
