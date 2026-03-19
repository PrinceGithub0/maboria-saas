import { prisma } from "@/lib/prisma";
import { addCalendarMonthUtcKeepingTime, computeUsageCycleKey } from "@/lib/usage/cycle";
import { usageFeatureToDb } from "@/lib/usage/ledger";

const METERED_FEATURES = ["ai_requests", "invoices", "whatsapp_messages", "automations_runs"] as const;

export async function rotateUsageCycles(now = new Date()) {
  const targets = await prisma.orgSubscription.findMany({
    where: { currentCycleEndAt: { lte: now } },
    select: {
      id: true,
      orgId: true,
      currentCycleStartAt: true,
      currentCycleEndAt: true,
      usageCycleAnchorDay: true,
    },
  });

  let updated = 0;
  for (const subscription of targets) {
    let start = new Date(subscription.currentCycleStartAt);
    let end = new Date(subscription.currentCycleEndAt);
    let advanced = false;
    while (end <= now) {
      start = end;
      end = addCalendarMonthUtcKeepingTime(start, 1);
      advanced = true;
    }
    if (!advanced) continue;

    const cycleKey = computeUsageCycleKey(start, end);
    await prisma.$transaction(async (tx) => {
      await tx.orgSubscription.update({
        where: { id: subscription.id },
        data: {
          currentCycleStartAt: start,
          currentCycleEndAt: end,
          usageCycleAnchorDay: Math.max(1, Math.min(28, start.getUTCDate())),
        },
      });

      // Ensure zero-baseline records exist for chart/totals reads.
      for (const feature of METERED_FEATURES) {
        await tx.usageCycleTotal.upsert({
          where: {
            orgId_featureKey_cycleKey: {
              orgId: subscription.orgId,
              featureKey: usageFeatureToDb(feature),
              cycleKey,
            },
          },
          update: {},
          create: {
            orgId: subscription.orgId,
            featureKey: usageFeatureToDb(feature),
            cycleKey,
            usedQuantity: 0,
          },
        });
      }
    });
    updated += 1;
  }

  return { scanned: targets.length, updated };
}

export async function reconcileUsageTotals(days = 60, now = new Date()) {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days));

  const grouped = await prisma.usageEvent.groupBy({
    by: ["orgId", "featureKey", "cycleKey"],
    where: { occurredAt: { gte: start, lte: now } },
    _sum: { quantity: true },
  });

  let corrected = 0;
  for (const row of grouped) {
    const used = Number(row._sum.quantity ?? 0);
    const existing = await prisma.usageCycleTotal.findUnique({
      where: {
        orgId_featureKey_cycleKey: {
          orgId: row.orgId,
          featureKey: row.featureKey,
          cycleKey: row.cycleKey,
        },
      },
      select: { usedQuantity: true },
    });
    if (!existing || Number(existing.usedQuantity) !== used) {
      await prisma.usageCycleTotal.upsert({
        where: {
          orgId_featureKey_cycleKey: {
            orgId: row.orgId,
            featureKey: row.featureKey,
            cycleKey: row.cycleKey,
          },
        },
        update: { usedQuantity: used },
        create: {
          orgId: row.orgId,
          featureKey: row.featureKey,
          cycleKey: row.cycleKey,
          usedQuantity: used,
        },
      });
      corrected += 1;
    }
  }

  const anomalyCount = await prisma.usageEvent.count({
    where: {
      occurredAt: { gte: start, lte: now },
      OR: [{ quantity: { lt: 0 } }, { idempotencyKey: "" }],
    },
  });

  return {
    scanned: grouped.length,
    corrected,
    anomalies: anomalyCount,
  };
}
