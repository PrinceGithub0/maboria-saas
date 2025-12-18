import { prisma } from "./prisma";
import { addDays } from "date-fns";

export async function trackUsage(userId: string, category: string, amount: number) {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ["ACTIVE", "TRIALING"] } },
  });
  const usageLimit = sub?.usageLimit ?? 0;
  if (usageLimit > 0 && amount > 0) {
    const total = await prisma.usageRecord.aggregate({
      where: { userId, period: sub?.usagePeriod || "monthly" },
      _sum: { amount: true },
    });
    const used = total._sum.amount || 0;
    if (used + amount > usageLimit) {
      await prisma.activityLog.create({
        data: { userId, action: "USAGE_LIMIT_EXCEEDED", metadata: { category, used, limit: usageLimit } },
      });
      if (sub?.status === "ACTIVE") {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "PAST_DUE", graceEndsAt: addDays(new Date(), 7) },
        });
      }
    }
  }
  await prisma.usageRecord.create({
    data: { userId, category, amount, period: sub?.usagePeriod || "monthly" },
  });
}

export async function resetUsageForPeriod() {
  // run daily cron to reset monthly usage
  const subs = await prisma.subscription.findMany({
    where: { status: { in: ["ACTIVE", "TRIALING"] } },
  });
  for (const sub of subs) {
    if (sub.usagePeriod === "monthly") {
      await prisma.usageRecord.deleteMany({ where: { userId: sub.userId, period: "monthly" } });
    }
  }
}
