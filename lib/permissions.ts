import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrCreateBusinessForUser } from "@/lib/business";
import { isSubscriptionActive, normalizeSubscriptionStatus } from "@/lib/subscription-access";

export async function getBusinessRoleForUser(userId: string) {
  const { business, role } = await getOrCreateBusinessForUser(userId);
  if (!business?.id) return { businessId: null, role: null };
  return { businessId: business.id, role: role ?? null };
}

export async function requireActiveSubscription(userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, plan: true },
  });
  const status = normalizeSubscriptionStatus(subscription?.status || null);
  if (!subscription || !isSubscriptionActive(subscription.status)) {
    return { ok: false as const, status, plan: subscription?.plan ?? null };
  }
  return { ok: true as const, status, plan: subscription.plan, subscriptionId: subscription.id };
}

export async function requireBillingAccess(userId: string) {
  const subscription = await requireActiveSubscription(userId);
  if (!subscription.ok) {
    return { ok: false, reason: "subscription_inactive" as const, status: subscription.status };
  }
  const { business, role } = await getOrCreateBusinessForUser(userId);
  if (!business?.id) return { ok: false, reason: "no_business" as const };
  if (role !== "owner" && role !== "admin") {
    return { ok: false, reason: "forbidden" as const };
  }
  return { ok: true, businessId: business.id };
}
