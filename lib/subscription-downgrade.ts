import "server-only";

import { prisma } from "@/lib/prisma";
import type { SubscriptionPlan } from "@prisma/client";

export async function scheduleDowngrade(userId: string, nextPlan: SubscriptionPlan) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription?.currentPeriodEnd) {
    return { ok: false, reason: "missing_period_end" };
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

  return { ok: true };
}

export async function applyPendingDowngrades(now = new Date()) {
  const due = await prisma.subscription.findMany({
    where: {
      pendingPlan: { not: null },
      pendingEffectiveAt: { lte: now },
    },
  });

  for (const sub of due) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        plan: sub.pendingPlan!,
        pendingPlan: null,
        pendingEffectiveAt: null,
      },
    });
    await prisma.activityLog.create({
      data: {
        userId: sub.userId,
        action: "SUBSCRIPTION_DOWNGRADE_APPLIED",
        resourceType: "subscription",
        resourceId: sub.id,
        metadata: { plan: sub.pendingPlan },
      },
    });
  }

  return { applied: due.length };
}
