import "server-only";

import { prisma } from "@/lib/prisma";
import { syncBusinessPlanForUser, subscriptionPlanToUserPlan } from "@/lib/entitlements";
import { deriveSubscriptionManagement } from "@/lib/subscription-management";
import { isScheduledDowngradeTarget } from "@/lib/subscription-downgrade-rules";
import { clampAnchorDay } from "@/lib/usage/cycle";
import {
  OrgBillingInterval,
  OrgSubscriptionStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";

export const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "ACTIVE",
  "PAST_DUE",
  "TRIALING",
];

const ACTIVE_ORG_SUBSCRIPTION_STATUSES: OrgSubscriptionStatus[] = [
  "ACTIVE",
  "PAST_DUE",
  "TRIALING",
];

function mapOrgStatusToSubscriptionStatus(status: OrgSubscriptionStatus): SubscriptionStatus {
  if (status === "PAST_DUE") return "PAST_DUE";
  if (status === "TRIALING") return "TRIALING";
  if (status === "CANCELED") return "CANCELED";
  return "ACTIVE";
}

function mapOrgBillingIntervalToSubscriptionInterval(interval: OrgBillingInterval): "monthly" | "yearly" {
  return interval === "YEARLY" ? "yearly" : "monthly";
}

function resolveSubscriptionRankDate(subscription: {
  currentPeriodEnd: Date | null;
  renewalDate: Date;
  updatedAt: Date;
  createdAt: Date;
}) {
  return (
    subscription.currentPeriodEnd ??
    subscription.renewalDate ??
    subscription.updatedAt ??
    subscription.createdAt
  );
}

export async function findCurrentSubscription(userId: string) {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId,
      status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });

  if (!subscriptions.length) return null;

  const [current, ...stale] = [...subscriptions].sort((left, right) => {
    const rankDelta =
      resolveSubscriptionRankDate(right).getTime() - resolveSubscriptionRankDate(left).getTime();
    if (rankDelta !== 0) return rankDelta;
    const updatedDelta = right.updatedAt.getTime() - left.updatedAt.getTime();
    if (updatedDelta !== 0) return updatedDelta;
    const createdDelta = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdDelta !== 0) return createdDelta;
    return right.id.localeCompare(left.id);
  });

  if (stale.length > 0) {
    await prisma.subscription.updateMany({
      where: {
        id: { in: stale.map((subscription) => subscription.id) },
        status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
      },
      data: {
        status: "CANCELED",
        autoRenew: false,
        cancelAtPeriodEnd: false,
        pendingPlan: null,
        pendingEffectiveAt: null,
        cancellationReason: "superseded_by_newer_active_subscription",
      },
    });
  }

  return current;
}

export async function ensureCurrentSubscriptionForOrg(userId: string, orgId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription_bridge:${userId}`}))`;

    const subscriptions = await tx.subscription.findMany({
      where: {
        userId,
        status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });

    if (subscriptions.length > 0) {
      const [current, ...stale] = [...subscriptions].sort((left, right) => {
        const rankDelta =
          resolveSubscriptionRankDate(right).getTime() - resolveSubscriptionRankDate(left).getTime();
        if (rankDelta !== 0) return rankDelta;
        const updatedDelta = right.updatedAt.getTime() - left.updatedAt.getTime();
        if (updatedDelta !== 0) return updatedDelta;
        const createdDelta = right.createdAt.getTime() - left.createdAt.getTime();
        if (createdDelta !== 0) return createdDelta;
        return right.id.localeCompare(left.id);
      });

      if (stale.length > 0) {
        await tx.subscription.updateMany({
          where: {
            id: { in: stale.map((subscription) => subscription.id) },
            status: { in: ACTIVE_SUBSCRIPTION_STATUSES },
          },
          data: {
            status: "CANCELED",
            autoRenew: false,
            cancelAtPeriodEnd: false,
            pendingPlan: null,
            pendingEffectiveAt: null,
            cancellationReason: "superseded_by_newer_active_subscription",
          },
        });
      }

      return current;
    }

    const orgSubscription = await tx.orgSubscription.findUnique({
      where: { orgId },
    });
    if (!orgSubscription || !ACTIVE_ORG_SUBSCRIPTION_STATUSES.includes(orgSubscription.status)) {
      return null;
    }

    const bridgedInterval = mapOrgBillingIntervalToSubscriptionInterval(orgSubscription.billingInterval);
    const bridgedStatus = mapOrgStatusToSubscriptionStatus(orgSubscription.status);
    const bridgedRenewalDate = orgSubscription.paidThroughAt ?? orgSubscription.currentCycleEndAt;

    const existingLinkedSubscription = orgSubscription.providerSubscriptionId
      ? await tx.subscription.findUnique({
          where: { id: orgSubscription.providerSubscriptionId },
        })
      : null;

    if (existingLinkedSubscription?.userId === userId) {
      return tx.subscription.update({
        where: { id: existingLinkedSubscription.id },
        data: {
          plan: orgSubscription.planId,
          status: bridgedStatus,
          renewalDate: bridgedRenewalDate,
          interval: bridgedInterval,
          provider: orgSubscription.provider,
          currentPeriodStart: orgSubscription.currentCycleStartAt,
          currentPeriodEnd: orgSubscription.currentCycleEndAt,
        },
      });
    }

    const bridged = await tx.subscription.create({
      data: {
        userId,
        plan: orgSubscription.planId,
        status: bridgedStatus,
        renewalDate: bridgedRenewalDate,
        interval: bridgedInterval,
        provider: orgSubscription.provider,
        currentPeriodStart: orgSubscription.currentCycleStartAt,
        currentPeriodEnd: orgSubscription.currentCycleEndAt,
        autoRenew: true,
        cancelAtPeriodEnd: false,
      },
    });

    await tx.orgSubscription.update({
      where: { orgId },
      data: {
        providerSubscriptionId: bridged.id,
      },
    });

    await tx.activityLog.create({
      data: {
        userId,
        action: "SUBSCRIPTION_BACKFILLED_FROM_ORG",
        resourceType: "subscription",
        resourceId: bridged.id,
        metadata: {
          orgId,
          orgSubscriptionId: orgSubscription.id,
        },
      },
    });

    return bridged;
  });
}

export async function scheduleSubscriptionCancellation(userId: string, orgId?: string) {
  const subscription = orgId
    ? await ensureCurrentSubscriptionForOrg(userId, orgId)
    : await findCurrentSubscription(userId);
  if (!subscription) {
    return { ok: false as const, reason: "no_active_subscription" as const };
  }

  const periodEnd = subscription.currentPeriodEnd ?? subscription.renewalDate ?? null;
  if (!periodEnd) {
    return { ok: false as const, reason: "missing_period_end" as const };
  }

  if (subscription.cancelAtPeriodEnd || subscription.autoRenew === false) {
    return { ok: false as const, reason: "already_scheduled" as const };
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      autoRenew: false,
      cancelAtPeriodEnd: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId,
      action: "SUBSCRIPTION_CANCEL_SCHEDULED",
      resourceType: "subscription",
      resourceId: subscription.id,
      metadata: { effectiveAt: periodEnd },
    },
  });

  return { ok: true as const, effectiveAt: periodEnd };
}

export async function resumeSubscriptionAutoRenew(userId: string, orgId?: string) {
  const subscription = orgId
    ? await ensureCurrentSubscriptionForOrg(userId, orgId)
    : await findCurrentSubscription(userId);
  if (!subscription) {
    return { ok: false as const, reason: "no_active_subscription" as const };
  }

  if (!subscription.cancelAtPeriodEnd && subscription.autoRenew !== false) {
    return { ok: false as const, reason: "not_scheduled" as const };
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      autoRenew: true,
      cancelAtPeriodEnd: false,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId,
      action: "SUBSCRIPTION_RENEWAL_RESUMED",
      resourceType: "subscription",
      resourceId: subscription.id,
    },
  });

  return { ok: true as const };
}

export async function scheduleDowngrade(userId: string, nextPlan: SubscriptionPlan, orgId?: string) {
  const subscription = orgId
    ? await ensureCurrentSubscriptionForOrg(userId, orgId)
    : await findCurrentSubscription(userId);
  if (!subscription) {
    return { ok: false as const, reason: "no_active_subscription" as const };
  }
  if (!subscription.currentPeriodEnd) {
    return { ok: false as const, reason: "missing_period_end" as const };
  }
  if (!isScheduledDowngradeTarget(subscription.plan, nextPlan)) {
    return { ok: false as const, reason: "not_a_downgrade" as const };
  }
  if (subscription.pendingPlan === nextPlan && subscription.pendingEffectiveAt) {
    return { ok: false as const, reason: "already_scheduled" as const };
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      pendingPlan: nextPlan,
      pendingEffectiveAt: subscription.currentPeriodEnd,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId,
      action: "SUBSCRIPTION_DOWNGRADE_SCHEDULED",
      resourceType: "subscription",
      resourceId: subscription.id,
      metadata: { pendingPlan: nextPlan, effectiveAt: subscription.currentPeriodEnd },
    },
  });

  return { ok: true as const };
}

export async function cancelScheduledDowngrade(userId: string, orgId?: string) {
  const subscription = orgId
    ? await ensureCurrentSubscriptionForOrg(userId, orgId)
    : await findCurrentSubscription(userId);
  if (!subscription) {
    return { ok: false as const, reason: "no_active_subscription" as const };
  }
  if (!subscription.pendingPlan || !subscription.pendingEffectiveAt) {
    return { ok: false as const, reason: "not_scheduled" as const };
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      pendingPlan: null,
      pendingEffectiveAt: null,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId,
      action: "SUBSCRIPTION_DOWNGRADE_CANCELED",
      resourceType: "subscription",
      resourceId: subscription.id,
      metadata: {
        pendingPlan: subscription.pendingPlan,
        effectiveAt: subscription.pendingEffectiveAt,
      },
    },
  });

  return { ok: true as const };
}

function toOrgBillingInterval(interval: string | null | undefined): OrgBillingInterval {
  return String(interval || "").toLowerCase() === "yearly" ? "YEARLY" : "MONTHLY";
}

function toOrgStatus(status: SubscriptionStatus): OrgSubscriptionStatus {
  if (status === "PAST_DUE") return "PAST_DUE";
  if (status === "TRIALING") return "TRIALING";
  if (status === "CANCELED" || status === "INACTIVE" || status === "REVOKED") return "CANCELED";
  return "ACTIVE";
}

export async function applyPendingDowngrades(now = new Date()) {
  const due = await prisma.subscription.findMany({
    where: {
      pendingPlan: { not: null },
      pendingEffectiveAt: { lte: now },
    },
  });

  let applied = 0;
  let skippedProviderManaged = 0;

  for (const sub of due) {
    const nextPlan = sub.pendingPlan!;
    const outcome = await prisma.$transaction(async (tx) => {
      const business = await tx.business.findFirst({
        where: {
          OR: [
            { ownerId: sub.userId },
            { members: { some: { userId: sub.userId, status: "active" } } },
          ],
        },
        select: {
          id: true,
          orgSubscription: {
            select: {
              provider: true,
              activationTimestamp: true,
              currentCycleStartAt: true,
              currentCycleEndAt: true,
              providerCustomerId: true,
            },
          },
        },
      });

      const management = deriveSubscriptionManagement({
        provider: sub.provider ?? business?.orgSubscription?.provider ?? null,
        providerCustomerId: business?.orgSubscription?.providerCustomerId ?? null,
        stateSource: business?.orgSubscription ? "org_subscription" : "subscription",
      });

      if (!management.canScheduleDowngradeInApp) {
        await tx.activityLog.create({
          data: {
            userId: sub.userId,
            action: "SUBSCRIPTION_DOWNGRADE_SKIPPED_PROVIDER_MANAGED",
            resourceType: "subscription",
            resourceId: sub.id,
            metadata: {
              plan: nextPlan,
              provider: management.provider,
              billingMode: management.billingMode,
            },
          },
        });

        return { applied: false as const, skippedProviderManaged: true as const };
      }

      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          plan: nextPlan,
          pendingPlan: null,
          pendingEffectiveAt: null,
        },
      });

      if (business) {
        await tx.orgSubscription.upsert({
          where: { orgId: business.id },
          update: {
            planId: nextPlan,
            status: toOrgStatus(sub.status),
            billingInterval: toOrgBillingInterval(sub.interval),
            provider: sub.provider,
            providerSubscriptionId: sub.id,
            paidThroughAt: sub.renewalDate ?? null,
            apiAccessEnabled: nextPlan === "ENTERPRISE",
          },
          create: {
            orgId: business.id,
            planId: nextPlan,
            status: toOrgStatus(sub.status),
            billingInterval: toOrgBillingInterval(sub.interval),
            provider: sub.provider,
            providerCustomerId: business.orgSubscription?.providerCustomerId ?? null,
            providerSubscriptionId: sub.id,
            paidThroughAt: sub.renewalDate ?? null,
            usageCycleAnchorDay: clampAnchorDay(now.getUTCDate()),
            activationTimestamp: business.orgSubscription?.activationTimestamp ?? now,
            currentCycleStartAt: business.orgSubscription?.currentCycleStartAt ?? now,
            currentCycleEndAt: business.orgSubscription?.currentCycleEndAt ?? sub.renewalDate ?? now,
            apiAccessEnabled: nextPlan === "ENTERPRISE",
          },
        });
      }

      await tx.activityLog.create({
        data: {
          userId: sub.userId,
          action: "SUBSCRIPTION_DOWNGRADE_APPLIED",
          resourceType: "subscription",
          resourceId: sub.id,
          metadata: { plan: nextPlan },
        },
      });

      return { applied: true as const, skippedProviderManaged: false as const };
    });

    if (outcome.skippedProviderManaged) {
      skippedProviderManaged += 1;
      continue;
    }

    applied += 1;
    await syncBusinessPlanForUser(sub.userId, subscriptionPlanToUserPlan(nextPlan));
  }

  return { applied, skippedProviderManaged };
}
