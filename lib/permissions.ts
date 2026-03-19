import "server-only";

import { normalizeSubscriptionStatus } from "@/lib/subscription-access";
import { getOrCreateBusinessForUser } from "@/lib/business";
import { requireOrgPermission, resolveOrgContext } from "@/lib/org-auth";

type BillingAccessDenied = {
  ok: false;
  reason: "subscription_inactive" | "forbidden";
  status: ReturnType<typeof normalizeSubscriptionStatus>;
  message: string;
};

type BillingAccessGranted = {
  ok: true;
  businessId: string;
  role: "owner" | "admin" | "billing_admin" | "member";
  ownerUserId: string;
};

export async function getBusinessRoleForUser(userId: string) {
  const context = await resolveOrgContext(userId);
  if (!context) return { businessId: null, role: null };
  return { businessId: context.orgId, role: context.role };
}

export async function requireActiveSubscription(userId: string) {
  const context = await resolveOrgContext(userId);
  if (!context) {
    return { ok: false as const, status: normalizeSubscriptionStatus(null), plan: null };
  }

  if (context.orgSubscriptionStatus !== "ACTIVE") {
    return {
      ok: false as const,
      status: normalizeSubscriptionStatus(context.orgSubscriptionStatus),
      plan: context.orgPlan,
      role: context.role,
    };
  }

  return {
    ok: true as const,
    status: "ACTIVE",
    plan: context.orgPlan,
    role: context.role,
    businessId: context.orgId,
  };
}

export async function requireBillingAccess(userId: string) {
  const access = await requireOrgPermission(userId, {
    permission: "settings:payout:write",
    requireActiveSubscription: true,
  });

  if (!access.ok) {
    return {
      ok: false as const,
      reason: access.code === "SUBSCRIPTION_INACTIVE" ? ("subscription_inactive" as const) : ("forbidden" as const),
      status: normalizeSubscriptionStatus(access.context?.orgSubscriptionStatus ?? null),
      message: access.message,
    } satisfies BillingAccessDenied;
  }

  return {
    ok: true as const,
    businessId: access.context.orgId,
    role: access.context.role,
    ownerUserId: access.context.ownerUserId,
  } satisfies BillingAccessGranted;
}

export async function ensureBusinessContext(userId: string) {
  return getOrCreateBusinessForUser(userId);
}
