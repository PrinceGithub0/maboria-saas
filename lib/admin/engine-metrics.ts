import { PaymentStatus, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPlanPriceForInterval } from "@/lib/pricing";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const;

export type EngineRangeKey = keyof typeof RANGE_DAYS;

type CanonicalPlan = "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "ENTERPRISE";

type PaymentAmountRecord = {
  createdAt: Date;
  amount: unknown;
  amountUsd: unknown;
};

type SubscriptionRevenueRecord = {
  createdAt: Date;
  updatedAt: Date;
  plan: SubscriptionPlan;
  interval: string;
  status: SubscriptionStatus;
};

type DeltaDirection = "up" | "down" | "flat";
type EngineStatusLevel = "HEALTHY" | "AT_RISK" | "CRITICAL";

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function withDaysAgo(date: Date, days: number) {
  return new Date(date.getTime() - days * DAY_MS);
}

function parseNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function sumPayments(payments: PaymentAmountRecord[]) {
  return payments.reduce((total, payment) => {
    const amountUsd = parseNumber(payment.amountUsd);
    return total + (amountUsd > 0 ? amountUsd : parseNumber(payment.amount));
  }, 0);
}

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizePlan(plan: SubscriptionPlan): CanonicalPlan {
  if (plan === "PREMIUM") return "BUSINESS";
  if (plan === "STARTER") return "STARTER";
  if (plan === "PRO") return "PRO";
  if (plan === "GROWTH") return "GROWTH";
  if (plan === "BUSINESS") return "BUSINESS";
  return "ENTERPRISE";
}

function normalizeInterval(interval: string | null | undefined): "monthly" | "yearly" {
  return String(interval || "").toLowerCase() === "yearly" ? "yearly" : "monthly";
}

function monthlyPlanRevenueUsd(plan: CanonicalPlan, interval: string | null | undefined) {
  if (plan === "ENTERPRISE") return 0;
  const normalizedInterval = normalizeInterval(interval);
  if (normalizedInterval === "yearly") {
    const yearly = getPlanPriceForInterval(plan, "USD", "yearly");
    if (yearly != null) return yearly / 12;
  }
  return getPlanPriceForInterval(plan, "USD", "monthly") ?? 0;
}

function formatSeriesLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function valueDelta(current: number, previous: number, asPercent = false) {
  const delta = current - previous;
  const percentDelta = previous > 0 ? (delta / previous) * 100 : current > 0 ? 100 : 0;
  const direction: DeltaDirection = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return {
    delta: round2(delta),
    deltaPercent: round2(percentDelta),
    direction,
    asPercent,
  };
}

function parsePlanFromUnknown(value: unknown): CanonicalPlan | null {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "PREMIUM") return "BUSINESS";
  if (
    normalized === "STARTER" ||
    normalized === "PRO" ||
    normalized === "GROWTH" ||
    normalized === "BUSINESS" ||
    normalized === "ENTERPRISE"
  ) {
    return normalized;
  }
  return null;
}

function pickObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function inferDowngradeImpactUsd(
  metadata: unknown,
  fallbackPlan: CanonicalPlan | null,
  fallbackInterval: string | null
) {
  const meta = pickObject(metadata);
  if (!meta) return 0;

  const fromPriceRaw = parseNumber(meta.fromPriceUsd);
  const toPriceRaw = parseNumber(meta.toPriceUsd);
  if (fromPriceRaw > 0 && toPriceRaw >= 0 && fromPriceRaw > toPriceRaw) {
    return round2(fromPriceRaw - toPriceRaw);
  }

  const fromPlan = parsePlanFromUnknown(meta.fromPlan ?? meta.previousPlan ?? meta.oldPlan);
  const toPlan = parsePlanFromUnknown(meta.toPlan ?? meta.plan ?? meta.newPlan);
  const interval = normalizeInterval(
    String(meta.interval || meta.billingInterval || fallbackInterval || "monthly")
  );
  if (fromPlan && toPlan) {
    const fromMonthly = monthlyPlanRevenueUsd(fromPlan, interval);
    const toMonthly = monthlyPlanRevenueUsd(toPlan, interval);
    if (fromMonthly > toMonthly) return round2(fromMonthly - toMonthly);
  }

  if (fallbackPlan && toPlan) {
    const fromMonthly = monthlyPlanRevenueUsd(
      fallbackPlan,
      normalizeInterval(fallbackInterval || String(meta.interval || "monthly"))
    );
    const toMonthly = monthlyPlanRevenueUsd(
      toPlan,
      normalizeInterval(fallbackInterval || String(meta.interval || "monthly"))
    );
    if (fromMonthly > toMonthly) return round2(fromMonthly - toMonthly);
  }

  return 0;
}

function inferEngineStatus(input: {
  churnRate30d: number;
  failedPaymentRate30d: number;
  collectionRate30d: number;
  retrySuccessRate7d: number;
  failedPayments30d: number;
  failedPaymentsPrevious30d: number;
}): { level: EngineStatusLevel; label: string } {
  const failedSpike =
    input.failedPayments30d >= 10 &&
    input.failedPayments30d > Math.max(input.failedPaymentsPrevious30d * 1.5, input.failedPaymentsPrevious30d + 4);

  if (input.churnRate30d > 7 || failedSpike) {
    return { level: "CRITICAL", label: "Critical" };
  }

  if (
    input.churnRate30d < 3 &&
    input.failedPaymentRate30d < 5 &&
    input.collectionRate30d > 95
  ) {
    return { level: "HEALTHY", label: "Healthy" };
  }

  if (
    (input.churnRate30d >= 3 && input.churnRate30d <= 7) ||
    input.retrySuccessRate7d < 85
  ) {
    return { level: "AT_RISK", label: "At Risk" };
  }

  return { level: "AT_RISK", label: "At Risk" };
}

export function parseEngineRange(value: string | null | undefined): EngineRangeKey {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "7d" || normalized === "30d" || normalized === "90d") return normalized;
  return "30d";
}

export async function getAdminEngineMetrics(range: EngineRangeKey) {
  const now = new Date();
  const rangeDays = RANGE_DAYS[range];
  const rangeStart = startOfUtcDay(withDaysAgo(now, rangeDays - 1));
  const previousRangeStart = startOfUtcDay(withDaysAgo(rangeStart, rangeDays));
  const prePreviousRangeStart = startOfUtcDay(withDaysAgo(previousRangeStart, rangeDays));
  const last7d = withDaysAgo(now, 7);
  const last14d = withDaysAgo(now, 14);
  const last30d = withDaysAgo(now, 30);
  const last60d = withDaysAgo(now, 60);
  const last90d = withDaysAgo(now, 90);

  const [
    activeSubscriptions,
    subscriptionsLast90d,
    atRiskSubscriptions,
    atRiskRecentUpdates,
    failedPayments30d,
    failedPaymentsPrevious30d,
    failedCharges7d,
    failedChargesPrevious7d,
    succeededChargesPrevious7d,
    refunded30d,
    refundedPrevious30d,
    providerStats7d,
    totalAttempts30d,
    totalAttemptsPrevious30d,
    succeededAttempts30d,
    succeededAttemptsPrevious30d,
    currentRangePayments,
    previousRangePayments,
    prePreviousRangePayments,
    current30dPayments,
    previous30dPayments,
    downgradeAuditEvents,
  ] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE },
      select: { userId: true, plan: true, interval: true, createdAt: true },
    }),
    prisma.subscription.findMany({
      where: {
        OR: [
          { createdAt: { gte: last90d } },
          { status: SubscriptionStatus.CANCELED, updatedAt: { gte: last90d } },
        ],
      },
      select: { createdAt: true, updatedAt: true, status: true, plan: true, interval: true },
    }),
    prisma.subscription.count({
      where: { status: { in: [SubscriptionStatus.PAST_DUE, SubscriptionStatus.INCOMPLETE] } },
    }),
    prisma.subscription.count({
      where: {
        status: { in: [SubscriptionStatus.PAST_DUE, SubscriptionStatus.INCOMPLETE] },
        updatedAt: { gte: last7d },
      },
    }),
    prisma.payment.count({
      where: { status: PaymentStatus.FAILED, createdAt: { gte: last30d } },
    }),
    prisma.payment.count({
      where: { status: PaymentStatus.FAILED, createdAt: { gte: last60d, lt: last30d } },
    }),
    prisma.payment.count({
      where: { status: PaymentStatus.FAILED, createdAt: { gte: last7d } },
    }),
    prisma.payment.count({
      where: {
        status: PaymentStatus.FAILED,
        createdAt: { gte: last14d, lt: last7d },
      },
    }),
    prisma.payment.count({
      where: {
        status: PaymentStatus.SUCCEEDED,
        createdAt: { gte: last14d, lt: last7d },
      },
    }),
    prisma.payment.count({
      where: { status: PaymentStatus.REFUNDED, createdAt: { gte: last30d } },
    }),
    prisma.payment.count({
      where: {
        status: PaymentStatus.REFUNDED,
        createdAt: { gte: last60d, lt: last30d },
      },
    }),
    prisma.payment.groupBy({
      by: ["provider", "status"],
      where: {
        createdAt: { gte: last7d },
        status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED] },
      },
      _count: { _all: true },
    }),
    prisma.payment.count({
      where: {
        status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED] },
        createdAt: { gte: last30d },
      },
    }),
    prisma.payment.count({
      where: {
        status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED] },
        createdAt: { gte: last60d, lt: last30d },
      },
    }),
    prisma.payment.count({
      where: {
        status: PaymentStatus.SUCCEEDED,
        createdAt: { gte: last30d },
      },
    }),
    prisma.payment.count({
      where: {
        status: PaymentStatus.SUCCEEDED,
        createdAt: { gte: last60d, lt: last30d },
      },
    }),
    prisma.payment.findMany({
      where: { status: PaymentStatus.SUCCEEDED, createdAt: { gte: rangeStart } },
      select: { createdAt: true, amount: true, amountUsd: true },
    }),
    prisma.payment.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        createdAt: { gte: previousRangeStart, lt: rangeStart },
      },
      select: { createdAt: true, amount: true, amountUsd: true },
    }),
    prisma.payment.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        createdAt: { gte: prePreviousRangeStart, lt: previousRangeStart },
      },
      select: { createdAt: true, amount: true, amountUsd: true },
    }),
    prisma.payment.findMany({
      where: { status: PaymentStatus.SUCCEEDED, createdAt: { gte: last30d } },
      select: { createdAt: true, amount: true, amountUsd: true },
    }),
    prisma.payment.findMany({
      where: {
        status: PaymentStatus.SUCCEEDED,
        createdAt: { gte: last60d, lt: last30d },
      },
      select: { createdAt: true, amount: true, amountUsd: true },
    }),
    prisma.auditLog.findMany({
      where: {
        actionType: "SUBSCRIPTION_DOWNGRADED",
        createdAt: { gte: rangeStart },
      },
      select: {
        metadata: true,
        userId: true,
      },
    }),
  ]);

  const activeSubscribers = activeSubscriptions.length;
  const mrrUsd = round2(
    activeSubscriptions.reduce((total, subscription) => {
      return total + monthlyPlanRevenueUsd(normalizePlan(subscription.plan), subscription.interval);
    }, 0)
  );

  const current30dRevenue = sumPayments(current30dPayments);
  const previous30dRevenue = sumPayments(previous30dPayments);
  const prePrevious30dRevenue = sumPayments(prePreviousRangePayments);
  const growth30d =
    previous30dRevenue > 0
      ? ((current30dRevenue - previous30dRevenue) / previous30dRevenue) * 100
      : current30dRevenue > 0
        ? 100
        : 0;
  const previousGrowth30d =
    prePrevious30dRevenue > 0
      ? ((previous30dRevenue - prePrevious30dRevenue) / prePrevious30dRevenue) * 100
      : previous30dRevenue > 0
        ? 100
        : 0;

  const subscriptions = subscriptionsLast90d as SubscriptionRevenueRecord[];
  const canceledLast30d = subscriptions.filter(
    (subscription) => subscription.status === SubscriptionStatus.CANCELED && subscription.updatedAt >= last30d
  ).length;
  const canceledPrevious30d = subscriptions.filter(
    (subscription) =>
      subscription.status === SubscriptionStatus.CANCELED &&
      subscription.updatedAt >= last60d &&
      subscription.updatedAt < last30d
  ).length;

  const newSubscribersLast30d = subscriptions.filter((subscription) => subscription.createdAt >= last30d).length;
  const activeSubscribers30dAgo = Math.max(0, activeSubscribers - newSubscribersLast30d + canceledLast30d);
  const churnRate30d = toPercent(canceledLast30d, activeSubscribers + canceledLast30d);
  const churnRatePrevious30d = toPercent(
    canceledPrevious30d,
    activeSubscribers30dAgo + canceledPrevious30d
  );
  const involuntaryChurnRate30d = toPercent(failedPayments30d, activeSubscribers + failedPayments30d);
  const failedPaymentRate30d = toPercent(failedPayments30d, totalAttempts30d);
  const collectionRate30d = toPercent(succeededAttempts30d, totalAttempts30d);

  const providerMap: Record<"PAYSTACK" | "FLUTTERWAVE", { failed: number; total: number }> = {
    PAYSTACK: { failed: 0, total: 0 },
    FLUTTERWAVE: { failed: 0, total: 0 },
  };
  let succeededCharges7d = 0;
  for (const stat of providerStats7d) {
    if (stat.provider !== "PAYSTACK" && stat.provider !== "FLUTTERWAVE") continue;
    providerMap[stat.provider].total += stat._count._all;
    if (stat.status === PaymentStatus.FAILED) {
      providerMap[stat.provider].failed += stat._count._all;
    }
    if (stat.status === PaymentStatus.SUCCEEDED) {
      succeededCharges7d += stat._count._all;
    }
  }

  const retrySuccessRate7d = toPercent(succeededCharges7d, succeededCharges7d + failedCharges7d);
  const retrySuccessRatePrevious7d = toPercent(
    succeededChargesPrevious7d,
    succeededChargesPrevious7d + failedChargesPrevious7d
  );
  const refundRate30d = toPercent(refunded30d, current30dPayments.length + refunded30d);
  const refundRatePrevious30d = toPercent(
    refundedPrevious30d,
    previous30dPayments.length + refundedPrevious30d
  );
  const collectionRatePrevious30d = toPercent(
    succeededAttemptsPrevious30d,
    totalAttemptsPrevious30d
  );

  const chartBucketMap = new Map<
    string,
    { date: string; name: string; revenue: number; newSubscribers: number; churnedSubscribers: number; netSubscriberChange: number }
  >();
  for (let i = 0; i < rangeDays; i += 1) {
    const day = new Date(rangeStart.getTime() + i * DAY_MS);
    const dateKey = day.toISOString().slice(0, 10);
    chartBucketMap.set(dateKey, {
      date: dateKey,
      name: formatSeriesLabel(day),
      revenue: 0,
      newSubscribers: 0,
      churnedSubscribers: 0,
      netSubscriberChange: 0,
    });
  }

  for (const payment of currentRangePayments) {
    const key = startOfUtcDay(payment.createdAt).toISOString().slice(0, 10);
    const bucket = chartBucketMap.get(key);
    if (!bucket) continue;
    bucket.revenue += parseNumber(payment.amountUsd || payment.amount);
  }

  for (const subscription of subscriptions) {
    const createdKey = startOfUtcDay(subscription.createdAt).toISOString().slice(0, 10);
    const createdBucket = chartBucketMap.get(createdKey);
    if (createdBucket) createdBucket.newSubscribers += 1;

    if (subscription.status === SubscriptionStatus.CANCELED) {
      const canceledKey = startOfUtcDay(subscription.updatedAt).toISOString().slice(0, 10);
      const canceledBucket = chartBucketMap.get(canceledKey);
      if (canceledBucket) canceledBucket.churnedSubscribers += 1;
    }
  }

  const series = Array.from(chartBucketMap.values()).map((bucket) => ({
    ...bucket,
    revenue: round2(bucket.revenue),
    netSubscriberChange: bucket.newSubscribers - bucket.churnedSubscribers,
  }));

  const currentRangeRevenue = sumPayments(currentRangePayments);
  const previousRangeRevenue = sumPayments(previousRangePayments);
  const currentRangeNewSubscribers = series.reduce((sum, row) => sum + row.newSubscribers, 0);
  const currentRangeChurnedSubscribers = series.reduce((sum, row) => sum + row.churnedSubscribers, 0);
  const currentRangeNetSubscribers = currentRangeNewSubscribers - currentRangeChurnedSubscribers;
  const previousRangeNewSubscribers = subscriptions.filter(
    (subscription) =>
      subscription.createdAt >= previousRangeStart && subscription.createdAt < rangeStart
  ).length;
  const previousRangeChurnedSubscribers = subscriptions.filter(
    (subscription) =>
      subscription.status === SubscriptionStatus.CANCELED &&
      subscription.updatedAt >= previousRangeStart &&
      subscription.updatedAt < rangeStart
  ).length;
  const previousRangeNetSubscribers = previousRangeNewSubscribers - previousRangeChurnedSubscribers;

  const newRevenueUsd = round2(
    subscriptions
      .filter((subscription) => subscription.createdAt >= rangeStart)
      .reduce((sum, subscription) => {
        return sum + monthlyPlanRevenueUsd(normalizePlan(subscription.plan), subscription.interval);
      }, 0)
  );

  const churnedRevenueUsd = round2(
    subscriptions
      .filter(
        (subscription) =>
          subscription.status === SubscriptionStatus.CANCELED &&
          subscription.updatedAt >= rangeStart
      )
      .reduce((sum, subscription) => {
        return sum + monthlyPlanRevenueUsd(normalizePlan(subscription.plan), subscription.interval);
      }, 0)
  );

  const activeSubscriptionByUser = new Map<string, { plan: CanonicalPlan; interval: string }>();
  for (const subscription of activeSubscriptions) {
    activeSubscriptionByUser.set(subscription.userId, {
      plan: normalizePlan(subscription.plan),
      interval: subscription.interval,
    });
  }

  const downgradeRevenueUsd = round2(
    downgradeAuditEvents.reduce((sum, event) => {
      const fallback = activeSubscriptionByUser.get(String(event.userId || ""));
      return (
        sum +
        inferDowngradeImpactUsd(event.metadata, fallback?.plan || null, fallback?.interval || null)
      );
    }, 0)
  );

  const netMrrChangeUsd = round2(newRevenueUsd - churnedRevenueUsd - downgradeRevenueUsd);
  const growthPercent =
    previousRangeRevenue > 0
      ? ((currentRangeRevenue - previousRangeRevenue) / previousRangeRevenue) * 100
      : currentRangeRevenue > 0
        ? 100
        : 0;

  const planOrder: CanonicalPlan[] = ["STARTER", "PRO", "GROWTH", "BUSINESS", "ENTERPRISE"];
  const planRows = planOrder.map((plan) => ({
    plan,
    subscribers: 0,
    mrrUsd: 0,
    sharePercent: 0,
  }));
  const planLookup = new Map<CanonicalPlan, (typeof planRows)[number]>(
    planRows.map((row) => [row.plan, row])
  );
  for (const subscription of activeSubscriptions) {
    const plan = normalizePlan(subscription.plan);
    const row = planLookup.get(plan);
    if (!row) continue;
    row.subscribers += 1;
    row.mrrUsd += monthlyPlanRevenueUsd(plan, subscription.interval);
  }
  const totalPlanMrr = planRows.reduce((sum, row) => sum + row.mrrUsd, 0);
  for (const row of planRows) {
    row.mrrUsd = round2(row.mrrUsd);
    row.sharePercent = round2(toPercent(row.mrrUsd, totalPlanMrr));
  }
  planRows.sort((a, b) => b.mrrUsd - a.mrrUsd);

  const avgSubscriptionDurationMonths =
    activeSubscriptions.length > 0
      ? activeSubscriptions.reduce((sum, subscription) => {
          return (
            sum +
            Math.max(0, now.getTime() - subscription.createdAt.getTime()) /
              (1000 * 60 * 60 * 24 * 30.4375)
          );
        }, 0) / activeSubscriptions.length
      : 0;

  const arpuUsd = activeSubscribers > 0 ? mrrUsd / activeSubscribers : 0;
  const ltvUsd = churnRate30d > 0 ? arpuUsd / (churnRate30d / 100) : arpuUsd * 24;

  const engineStatus = inferEngineStatus({
    churnRate30d,
    failedPaymentRate30d,
    collectionRate30d,
    retrySuccessRate7d,
    failedPayments30d,
    failedPaymentsPrevious30d,
  });

  return {
    currency: "USD" as const,
    range,
    lastUpdatedAt: now.toISOString(),
    engineStatus,
    kpis: {
      activeSubscribers: {
        value: activeSubscribers,
        ...valueDelta(activeSubscribers, activeSubscribers30dAgo),
        context: "this month",
      },
      mrrUsd: {
        value: round2(mrrUsd),
        ...valueDelta(current30dRevenue, previous30dRevenue, true),
        context: "vs last 30 days",
      },
      growth30d: {
        value: round2(growth30d),
        ...valueDelta(growth30d, previousGrowth30d, true),
        context: "vs previous period",
      },
      churnRate30d: {
        value: round2(churnRate30d),
        ...valueDelta(churnRate30d, churnRatePrevious30d, true),
        context: "vs previous period",
      },
      failedPayments30d: {
        value: failedPayments30d,
        ...valueDelta(failedPayments30d, failedPaymentsPrevious30d),
        context: "vs previous period",
      },
    },
    revenue: {
      currentRangeRevenueUsd: round2(currentRangeRevenue),
      previousRangeRevenueUsd: round2(previousRangeRevenue),
      netRevenueDeltaUsd: round2(currentRangeRevenue - previousRangeRevenue),
      netSubscribers: currentRangeNetSubscribers,
      netSubscribersDelta: currentRangeNetSubscribers - previousRangeNetSubscribers,
      growthPercent: round2(growthPercent),
      series,
      mrrMovement: {
        newRevenueUsd,
        churnedRevenueUsd,
        downgradeRevenueUsd,
        netChangeUsd: netMrrChangeUsd,
      },
    },
    churnRetention: {
      subscribersAtRisk: atRiskSubscriptions,
      atRiskDelta7d: atRiskRecentUpdates,
      voluntaryChurnRate30d: round2(churnRate30d),
      involuntaryChurnRate30d: round2(involuntaryChurnRate30d),
      retentionRate30d: round2(Math.max(0, 100 - churnRate30d)),
      averageSubscriptionDurationMonths: round2(avgSubscriptionDurationMonths),
    },
    paymentHealth: {
      failedCharges7d,
      retrySuccessRate7d: round2(retrySuccessRate7d),
      retrySuccessRateDelta: valueDelta(retrySuccessRate7d, retrySuccessRatePrevious7d, true),
      refundRate30d: round2(refundRate30d),
      refundRateDelta: valueDelta(refundRate30d, refundRatePrevious30d, true),
      collectionRate30d: round2(collectionRate30d),
      collectionRateDelta: valueDelta(collectionRate30d, collectionRatePrevious30d, true),
      failedPaymentRate30d: round2(failedPaymentRate30d),
      providers: (["PAYSTACK", "FLUTTERWAVE"] as const).map((provider) => {
        const item = providerMap[provider];
        const failureRate = toPercent(item.failed, item.total);
        const status = item.total === 0 || failureRate < 15 ? "Healthy" : "Degraded";
        return {
          name: provider === "PAYSTACK" ? "Paystack" : "Flutterwave",
          status,
          failureRate: round2(failureRate),
        };
      }),
    },
    revenueByPlan: planRows,
    advanced: {
      arpuUsd: round2(arpuUsd),
      ltvUsd: round2(ltvUsd),
      ltvLabel: churnRate30d <= 0 ? "Strong retention (no churn detected)" : null,
      averageSubscriptionDurationMonths: round2(avgSubscriptionDurationMonths),
    },
  };
}
