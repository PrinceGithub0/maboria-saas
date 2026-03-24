export function resolveStripeOrgSubscriptionUpdate(input: {
  providerCustomerId?: string | null;
  localSubscriptionId?: string | null;
  currentLinkedSubscriptionId?: string | null;
}) {
  const normalize = (value: string | null | undefined) => {
    const trimmed = String(value || "").trim();
    return trimmed || null;
  };

  return {
    provider: "STRIPE" as const,
    providerCustomerId: normalize(input.providerCustomerId),
    providerSubscriptionId:
      normalize(input.localSubscriptionId) ?? normalize(input.currentLinkedSubscriptionId),
  };
}
