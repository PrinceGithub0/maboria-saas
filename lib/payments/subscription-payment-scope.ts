const ACTIVE_ORG_SUBSCRIPTION_STATUSES = new Set(["ACTIVE", "PAST_DUE", "TRIALING"]);

function normalizeId(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

export function resolveSubscriptionPaymentScope(input: {
  ownedBusinessCount: number;
  linkedSubscriptionId?: string | null;
  bridgedSubscriptionId?: string | null;
  orgSubscriptionStatus?: string | null;
}) {
  if (input.ownedBusinessCount <= 1) {
    return { mode: "owner_wide" as const, subscriptionId: null };
  }

  const subscriptionId =
    normalizeId(input.linkedSubscriptionId) ?? normalizeId(input.bridgedSubscriptionId);
  if (subscriptionId) {
    return { mode: "scoped_subscription" as const, subscriptionId };
  }

  const orgSubscriptionStatus = String(input.orgSubscriptionStatus || "").trim().toUpperCase();
  if (ACTIVE_ORG_SUBSCRIPTION_STATUSES.has(orgSubscriptionStatus)) {
    return { mode: "empty" as const, subscriptionId: null };
  }

  return { mode: "empty" as const, subscriptionId: null };
}
