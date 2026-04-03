import "server-only";

import { buildAutomationFlowWhere, buildAutomationRunWhere, resolveAutomationScope } from "@/lib/automation/access";
import { prisma } from "@/lib/prisma";
import { normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { isPlatformRole } from "@/lib/global-role";
import type {
  DashboardDateRange,
  DateRangeKey,
  InfrastructureDashboardPayload,
  SystemState,
  TimelineEntry,
  TimelineStatus,
  TrendPoint,
} from "@/lib/dashboard/control-types";

type DashboardDataOptions = {
  userId: string;
  role?: string;
  range?: string | null;
  from?: string | null;
  to?: string | null;
};

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function parseYmd(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function resolveDashboardRange(
  rangeValue?: string | null,
  fromValue?: string | null,
  toValue?: string | null
): DashboardDateRange {
  const now = new Date();
  const todayEnd = endOfDay(now);
  const requested = (rangeValue || "7d").toLowerCase() as DateRangeKey;

  if (requested === "today") {
    const day = isoDay(now);
    return {
      key: "today",
      from: day,
      to: day,
      label: "Today",
      query: { range: "today" },
    };
  }

  if (requested === "30d") {
    const start = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
    return {
      key: "30d",
      from: isoDay(start),
      to: isoDay(todayEnd),
      label: "Last 30 Days",
      query: { range: "30d" },
    };
  }

  if (requested === "custom") {
    const parsedFrom = parseYmd(fromValue);
    const parsedTo = parseYmd(toValue);
    if (parsedFrom && parsedTo && parsedFrom.getTime() <= parsedTo.getTime()) {
      return {
        key: "custom",
        from: isoDay(parsedFrom),
        to: isoDay(parsedTo),
        label: "Custom",
        query: { range: "custom", from: isoDay(parsedFrom), to: isoDay(parsedTo) },
      };
    }
  }

  const start = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  return {
    key: "7d",
    from: isoDay(start),
    to: isoDay(todayEnd),
    label: "Last 7 Days",
    query: { range: "7d" },
  };
}

function parseLogArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
}

function computeAverageDurationMs(items: Array<{ startedAt?: Date | null; completedAt?: Date | null }>) {
  const durations = items
    .map((item) => {
      if (!item.startedAt || !item.completedAt) return null;
      const diff = item.completedAt.getTime() - item.startedAt.getTime();
      return diff >= 0 ? diff : null;
    })
    .filter((value): value is number => typeof value === "number");

  if (!durations.length) return null;
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
}

function runStatusToTimeline(status: string): TimelineStatus {
  const normalized = status.toUpperCase();
  if (normalized === "FAILED") return "failed";
  if (normalized === "RUNNING" || normalized === "PENDING") return "warning";
  if (normalized === "SUCCESS") return "success";
  return "info";
}

function hasFinancialStep(logs: unknown) {
  const items = parseLogArray(logs);
  return items.some((log) => {
    const step = String(log.step || "");
    return /late[_\s-]?fee|refund|mark[\s_-]*as[\s_-]*paid|cancel[\s_-]*invoice/i.test(step);
  });
}

function queueStatusFor(pendingRuns: number): "Low" | "Moderate" | "High" {
  if (pendingRuns >= 30) return "High";
  if (pendingRuns >= 10) return "Moderate";
  return "Low";
}

function stateFor({
  failedRuns,
  failedLastHour,
  paymentSuccessRate,
  webhookFailures,
  messagingFailures,
}: {
  failedRuns: number;
  failedLastHour: number;
  paymentSuccessRate: number;
  webhookFailures: number;
  messagingFailures: number;
}): SystemState {
  if (failedLastHour > 0 || webhookFailures > 0 || paymentSuccessRate < 80 || messagingFailures >= 3) {
    return "critical";
  }
  if (failedRuns > 0 || paymentSuccessRate < 95 || messagingFailures > 0) {
    return "degraded";
  }
  return "stable";
}

function summaryFor(state: SystemState, failedLastHour: number, messagingFailures: number) {
  if (state === "critical") {
    if (messagingFailures > 0) return "Messaging provider outage affecting delivery.";
    if (failedLastHour > 0) return "Automation execution failures detected. Active incident handling in progress.";
    return "Critical system degradation detected. Immediate action required.";
  }
  if (state === "degraded") {
    return "Payment latency elevated. Monitoring in progress.";
  }
  return "All automations operating normally. No critical risks detected.";
}

export async function getInfrastructureDashboardData(
  options: DashboardDataOptions
): Promise<InfrastructureDashboardPayload> {
  const range = resolveDashboardRange(options.range, options.from, options.to);
  const rangeStart = startOfDay(new Date(`${range.from}T00:00:00`));
  const rangeEnd = endOfDay(new Date(`${range.to}T00:00:00`));
  const now = new Date();
  const todayStart = startOfDay(now);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sevenDayStart = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  const automationScope = await resolveAutomationScope(options.userId);

  const canViewBilling = true;
  const canViewInfrastructure = isPlatformRole(options.role);

  const [
    activeAutomations,
    pausedAutomations,
    runStatusGroups,
    runStatusGroupsToday,
    pendingRunsCount,
    runDurations,
    runDurationsToday,
    paymentStatusGroups,
    revenueGroups,
    invoicesSent,
    invoicesOverdue,
    failedLastHour,
    webhookFailures,
    recentMessagingRuns,
    runsForTrend,
    recentRuns,
    recentPayments,
    recentInvoices,
  ] = await Promise.all([
    prisma.automationFlow.count({ where: buildAutomationFlowWhere(automationScope, { status: "ACTIVE" }) }),
    prisma.automationFlow.count({ where: buildAutomationFlowWhere(automationScope, { status: "PAUSED" }) }),
    prisma.automationRun.groupBy({
      by: ["runStatus"],
      _count: { _all: true },
      where: buildAutomationRunWhere(automationScope, { createdAt: { gte: rangeStart, lte: rangeEnd } }),
    }),
    prisma.automationRun.groupBy({
      by: ["runStatus"],
      _count: { _all: true },
      where: buildAutomationRunWhere(automationScope, { createdAt: { gte: todayStart } }),
    }),
    prisma.automationRun.count({
      where: buildAutomationRunWhere(automationScope, { runStatus: { in: ["PENDING", "RUNNING"] } }),
    }),
    prisma.automationRun.findMany({
      where: buildAutomationRunWhere(automationScope, {
        createdAt: { gte: rangeStart, lte: rangeEnd },
        startedAt: { not: null },
        completedAt: { not: null },
      }),
      select: { startedAt: true, completedAt: true },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
    prisma.automationRun.findMany({
      where: buildAutomationRunWhere(automationScope, {
        createdAt: { gte: todayStart },
        startedAt: { not: null },
        completedAt: { not: null },
      }),
      select: { startedAt: true, completedAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.payment.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { userId: options.userId, createdAt: { gte: rangeStart, lte: rangeEnd } },
    }),
    prisma.payment.groupBy({
      by: ["currency"],
      _sum: { amount: true },
      where: { userId: options.userId, status: "SUCCEEDED", createdAt: { gte: rangeStart, lte: rangeEnd } },
    }),
    prisma.invoice.count({
      where: { userId: options.userId, subscriptionId: null, generatedAt: { gte: rangeStart, lte: rangeEnd } },
    }),
    prisma.invoice.count({
      where: {
        userId: options.userId,
        subscriptionId: null,
        status: "OVERDUE",
        generatedAt: { gte: rangeStart, lte: rangeEnd },
      },
    }),
    prisma.automationRun.count({
      where: buildAutomationRunWhere(automationScope, { runStatus: "FAILED", createdAt: { gte: oneHourAgo } }),
    }),
    prisma.activityLog.count({
      where: { userId: options.userId, action: "WEBHOOK_FAILED", timestamp: { gte: rangeStart, lte: rangeEnd } },
    }),
    prisma.automationRun.findMany({
      where: buildAutomationRunWhere(automationScope, { createdAt: { gte: rangeStart, lte: rangeEnd } }),
      select: { id: true, runStatus: true, logs: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    prisma.automationRun.findMany({
      where: buildAutomationRunWhere(automationScope, { createdAt: { gte: sevenDayStart } }),
      select: { runStatus: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.automationRun.findMany({
      where: buildAutomationRunWhere(automationScope, { createdAt: { gte: rangeStart, lte: rangeEnd } }),
      select: {
        id: true,
        flowId: true,
        runStatus: true,
        logs: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        flow: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.payment.findMany({
      where: { userId: options.userId, createdAt: { gte: rangeStart, lte: rangeEnd } },
      select: { id: true, status: true, createdAt: true, reference: true, metadata: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.invoice.findMany({
      where: { userId: options.userId, subscriptionId: null, generatedAt: { gte: rangeStart, lte: rangeEnd } },
      select: { id: true, invoiceNumber: true, status: true, generatedAt: true, metadata: true },
      orderBy: { generatedAt: "desc" },
      take: 40,
    }),
  ]);

  const statusCountMap = new Map<string, number>();
  runStatusGroups.forEach((row) => statusCountMap.set(String(row.runStatus).toUpperCase(), row._count._all || 0));
  const successRuns = statusCountMap.get("SUCCESS") || 0;
  const failedRuns = statusCountMap.get("FAILED") || 0;
  const terminalRuns = successRuns + failedRuns;
  const successRate = terminalRuns > 0 ? Math.round((successRuns / terminalRuns) * 100) : 0;

  const statusTodayMap = new Map<string, number>();
  runStatusGroupsToday.forEach((row) => statusTodayMap.set(String(row.runStatus).toUpperCase(), row._count._all || 0));
  const runsToday =
    (statusTodayMap.get("SUCCESS") || 0) +
    (statusTodayMap.get("FAILED") || 0) +
    (statusTodayMap.get("RUNNING") || 0) +
    (statusTodayMap.get("PENDING") || 0);
  const failuresToday = statusTodayMap.get("FAILED") || 0;

  const averageExecutionMs = computeAverageDurationMs(runDurations);
  const averageDurationTodayMs = computeAverageDurationMs(runDurationsToday);

  const paymentStatusMap = new Map<string, number>();
  paymentStatusGroups.forEach((row) => paymentStatusMap.set(String(row.status).toUpperCase(), row._count._all || 0));
  const paymentSuccess = paymentStatusMap.get("SUCCEEDED") || 0;
  const paymentFailed = paymentStatusMap.get("FAILED") || 0;
  const paymentTotal = paymentSuccess + paymentFailed;
  const paymentSuccessRate = paymentTotal > 0 ? Math.round((paymentSuccess / paymentTotal) * 100) : 0;

  const primaryCurrency = normalizeCurrency((revenueGroups[0]?.currency as string) || "USD");
  const revenue = revenueGroups.reduce((sum, row) => sum + Number(row._sum.amount || 0), 0);

  const messagingFailures = recentMessagingRuns.filter((run) => {
    const logs = parseLogArray(run.logs);
    return logs.some((log) => {
      const step = String(log.step || "").toLowerCase();
      const result = String(log.result || "").toLowerCase();
      return (step.includes("whatsapp") || step.includes("email")) && (result.includes("retry") || result === "failed");
    });
  }).length;

  const state = stateFor({
    failedRuns,
    failedLastHour,
    paymentSuccessRate,
    webhookFailures,
    messagingFailures,
  });

  const queueStatus = queueStatusFor(pendingRunsCount);

  const alertItems: string[] = [];
  if (failedLastHour > 0) alertItems.push(`${failedLastHour} automations failed in the last hour`);
  if (messagingFailures > 0) alertItems.push("Messaging delivery delays detected");
  if (pendingRunsCount > 0) alertItems.push(`${pendingRunsCount} retries pending`);
  if (alertItems.length === 0) alertItems.push("All automations running normally");

  const trendBuckets = new Map<string, { success: number; failed: number }>();
  const trendDays: Date[] = [];
  for (let index = 6; index >= 0; index -= 1) {
    const day = startOfDay(new Date(now.getTime() - index * 24 * 60 * 60 * 1000));
    trendDays.push(day);
    trendBuckets.set(isoDay(day), { success: 0, failed: 0 });
  }
  runsForTrend.forEach((run) => {
    const key = isoDay(run.createdAt);
    const bucket = trendBuckets.get(key);
    if (!bucket) return;
    const normalized = String(run.runStatus).toUpperCase();
    if (normalized === "SUCCESS") bucket.success += 1;
    if (normalized === "FAILED") bucket.failed += 1;
  });
  const trend: TrendPoint[] = trendDays.map((day) => {
    const key = isoDay(day);
    const bucket = trendBuckets.get(key) || { success: 0, failed: 0 };
    const total = bucket.success + bucket.failed;
    const value = total > 0 ? Math.round((bucket.success / total) * 100) : 0;
    return {
      label: day.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      value,
    };
  });

  const timeline: TimelineEntry[] = [];

  recentRuns.forEach((run) => {
    const status = runStatusToTimeline(String(run.runStatus));
    const durationMs =
      run.startedAt && run.completedAt ? Math.max(0, run.completedAt.getTime() - run.startedAt.getTime()) : null;
    timeline.push({
      id: `run-${run.id}`,
      status,
      title: `${run.flow?.title || "Automation"} ${status === "failed" ? "failed" : status === "success" ? "completed" : "updated"}`,
      timestamp: run.createdAt.toISOString(),
      durationMs,
      canRetry: status === "failed" && !hasFinancialStep(run.logs),
      runId: run.id,
    });
  });

  recentPayments.forEach((payment) => {
    const meta = (payment.metadata || {}) as Record<string, unknown>;
    const paymentStatus = String(payment.status).toUpperCase();
    timeline.push({
      id: `payment-${payment.id}`,
      status: paymentStatus === "FAILED" ? "failed" : "success",
      title: paymentStatus === "FAILED" ? "Payment failed" : "Payment received",
      customer: String(meta.customerName || meta.customerEmail || "") || null,
      invoice: String(meta.invoiceNumber || "") || null,
      timestamp: payment.createdAt.toISOString(),
      runId: null,
      canRetry: false,
    });
  });

  recentInvoices.forEach((invoice) => {
    const meta = (invoice.metadata || {}) as Record<string, unknown>;
    const invoiceStatus = String(invoice.status).toUpperCase();
    timeline.push({
      id: `invoice-${invoice.id}`,
      status: invoiceStatus === "OVERDUE" ? "warning" : invoiceStatus === "PAID" ? "success" : "info",
      title:
        invoiceStatus === "OVERDUE"
          ? "Invoice became overdue"
          : invoiceStatus === "PAID"
            ? "Invoice marked as paid"
            : "Invoice updated",
      customer: String(meta.customerName || meta.customerEmail || "") || null,
      invoice: invoice.invoiceNumber,
      timestamp: invoice.generatedAt.toISOString(),
      runId: null,
      canRetry: false,
    });
  });

  timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    dateRange: range,
    generatedAt: now.toISOString(),
    commandStrip: {
      state,
      activeAutomations,
      failedRuns,
      queueStatus,
      averageExecutionMs,
      lastUpdated: now.toISOString(),
    },
    alertStrip: {
      mode: alertItems[0] === "All automations running normally" ? "ok" : "warning",
      items: alertItems,
    },
    primary: {
      successRate,
      runsToday,
      failuresToday,
      averageDurationMs: averageDurationTodayMs,
      trend,
      summary: summaryFor(state, failedLastHour, messagingFailures),
    },
    modules: {
      automation: {
        active: activeAutomations,
        paused: pausedAutomations,
        failedRuns,
      },
      billing: canViewBilling
        ? {
            revenue,
            currency: primaryCurrency || "USD",
            invoicesSent,
            invoicesOverdue,
            paymentSuccessRate,
          }
        : undefined,
      infrastructure: canViewInfrastructure
        ? {
            webhookStatus: webhookFailures > 0 ? "Degraded" : "Healthy",
            messagingStatus: messagingFailures > 0 ? "Degraded" : "Healthy",
            apiLatencyMs: averageExecutionMs,
            errorRate: terminalRuns > 0 ? Math.round((failedRuns / terminalRuns) * 100) : 0,
          }
        : undefined,
    },
    timeline: timeline.slice(0, 100),
    permissions: {
      canViewBilling,
      canViewInfrastructure,
    },
  };
}
