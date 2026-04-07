import { prisma } from "../prisma";

type AutomationHealthAlertSeverity = "info" | "warning" | "critical";

type AutomationHealthAlert = {
  key: string;
  severity: AutomationHealthAlertSeverity;
  title: string;
  message: string;
  metrics: Record<string, number>;
};

type AutomationHealthSnapshot = {
  generatedAt: string;
  windowMinutes: number;
  metrics: {
    totalRuns: number;
    failedRuns: number;
    failureRate: number;
    pendingRuns: number;
    runningRuns: number;
    duePendingRuns: number;
    staleRunningRuns: number;
    avgDurationMs: number;
    providerFailures: number;
  };
  alerts: AutomationHealthAlert[];
};

const HEALTH_WINDOW_MINUTES = 60;
const ALERT_DEDUPE_WINDOW_MINUTES = 15;

const parseNextRunAt = (output: unknown) => {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const resumeState = (output as Record<string, unknown>)["resumeState"];
  if (!resumeState || typeof resumeState !== "object" || Array.isArray(resumeState)) return null;
  const raw = String((resumeState as Record<string, unknown>)["nextRunAt"] || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const buildAlerts = (metrics: AutomationHealthSnapshot["metrics"]): AutomationHealthAlert[] => {
  const alerts: AutomationHealthAlert[] = [];

  if (metrics.totalRuns >= 20 && metrics.failureRate >= 0.2) {
    alerts.push({
      key: "failure_rate_high",
      severity: metrics.failureRate >= 0.35 ? "critical" : "warning",
      title: "Automation failure rate is elevated",
      message: `Failure rate is ${(metrics.failureRate * 100).toFixed(1)}% in the last ${HEALTH_WINDOW_MINUTES} minutes.`,
      metrics: { totalRuns: metrics.totalRuns, failedRuns: metrics.failedRuns },
    });
  }

  if (metrics.duePendingRuns >= 25) {
    alerts.push({
      key: "due_pending_backlog",
      severity: metrics.duePendingRuns >= 75 ? "critical" : "warning",
      title: "Due automation backlog detected",
      message: `${metrics.duePendingRuns} pending runs are due for execution.`,
      metrics: { duePendingRuns: metrics.duePendingRuns, pendingRuns: metrics.pendingRuns },
    });
  }

  if (metrics.staleRunningRuns >= 10) {
    alerts.push({
      key: "stale_running_runs",
      severity: metrics.staleRunningRuns >= 25 ? "critical" : "warning",
      title: "Stale running automations detected",
      message: `${metrics.staleRunningRuns} runs have stayed in RUNNING status beyond threshold.`,
      metrics: { staleRunningRuns: metrics.staleRunningRuns, runningRuns: metrics.runningRuns },
    });
  }

  if (metrics.providerFailures >= 5) {
    alerts.push({
      key: "provider_failure_spike",
      severity: metrics.providerFailures >= 12 ? "critical" : "warning",
      title: "Messaging provider failures increased",
      message: `${metrics.providerFailures} provider retry-exhausted events recorded in the last ${HEALTH_WINDOW_MINUTES} minutes.`,
      metrics: { providerFailures: metrics.providerFailures },
    });
  }

  if (metrics.pendingRuns >= 250) {
    alerts.push({
      key: "pending_queue_growth",
      severity: metrics.pendingRuns >= 500 ? "critical" : "warning",
      title: "Pending automation queue is growing",
      message: `${metrics.pendingRuns} runs are currently pending.`,
      metrics: { pendingRuns: metrics.pendingRuns },
    });
  }

  return alerts;
};

export async function getAutomationHealthSnapshot(): Promise<AutomationHealthSnapshot> {
  const now = new Date();
  const since = new Date(now.getTime() - HEALTH_WINDOW_MINUTES * 60_000);
  const staleCutoff = new Date(now.getTime() - 10 * 60_000);

  const [totalRuns, failedRuns, pendingRuns, runningRuns, pendingRecords, completedRuns, providerFailures] =
    await prisma.$transaction([
      prisma.automationRun.count({
        where: { createdAt: { gte: since } },
      }),
      prisma.automationRun.count({
        where: { createdAt: { gte: since }, runStatus: "FAILED" },
      }),
      prisma.automationRun.count({
        where: { runStatus: "PENDING" },
      }),
      prisma.automationRun.count({
        where: { runStatus: "RUNNING" },
      }),
      prisma.automationRun.findMany({
        where: { runStatus: "PENDING" },
        select: { output: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 1000,
      }),
      prisma.automationRun.findMany({
        where: {
          createdAt: { gte: since },
          runStatus: { in: ["SUCCESS", "FAILED"] },
          startedAt: { not: null },
          completedAt: { not: null },
        },
        select: { startedAt: true, completedAt: true },
        orderBy: { createdAt: "desc" },
        take: 2000,
      }),
      prisma.activityLog.count({
        where: {
          action: "AUTOMATION_PROVIDER_RETRY_EXHAUSTED",
          timestamp: { gte: since },
        },
      }),
    ]);

  const duePendingRuns = pendingRecords.filter((run) => {
    const nextRunAt = parseNextRunAt(run.output);
    return !nextRunAt || nextRunAt.getTime() <= now.getTime();
  }).length;

  const staleRunningRuns = await prisma.automationRun.count({
    where: {
      runStatus: "RUNNING",
      startedAt: { lte: staleCutoff },
    },
  });

  const durations = completedRuns
    .map((run) => {
      if (!run.startedAt || !run.completedAt) return 0;
      return Math.max(0, run.completedAt.getTime() - run.startedAt.getTime());
    })
    .filter((ms) => ms > 0);
  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;

  const failureRate = totalRuns > 0 ? failedRuns / totalRuns : 0;

  const metrics = {
    totalRuns,
    failedRuns,
    failureRate,
    pendingRuns,
    runningRuns,
    duePendingRuns,
    staleRunningRuns,
    avgDurationMs,
    providerFailures,
  };

  return {
    generatedAt: now.toISOString(),
    windowMinutes: HEALTH_WINDOW_MINUTES,
    metrics,
    alerts: buildAlerts(metrics),
  };
}

const buildAlertFingerprint = (alert: AutomationHealthAlert, timestampIso: string) => {
  const timestamp = new Date(timestampIso);
  const bucketMs = ALERT_DEDUPE_WINDOW_MINUTES * 60_000;
  const bucket = Math.floor(timestamp.getTime() / bucketMs) * bucketMs;
  return `${alert.key}:${new Date(bucket).toISOString()}`;
};

export async function emitAutomationHealthAlerts(snapshot: AutomationHealthSnapshot) {
  if (!snapshot.alerts.length) {
    return { emitted: 0, skipped: 0, alerts: snapshot.alerts };
  }

  const admins = await prisma.user.findMany({
    where: { role: { in: ["OPS_ADMIN"] } },
    select: { id: true },
  });
  if (!admins.length) {
    return { emitted: 0, skipped: snapshot.alerts.length, alerts: snapshot.alerts };
  }

  let emitted = 0;
  let skipped = 0;

  for (const alert of snapshot.alerts) {
    const fingerprint = buildAlertFingerprint(alert, snapshot.generatedAt);
    const alreadyEmitted = await prisma.activityLog.count({
      where: {
        action: "AUTOMATION_HEALTH_ALERT",
        metadata: { path: ["fingerprint"], equals: fingerprint },
      },
    });

    if (alreadyEmitted > 0) {
      skipped += 1;
      continue;
    }

    const message = `[${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`;
    await prisma.$transaction([
      prisma.activityLog.create({
        data: {
          userId: admins[0].id,
          action: "AUTOMATION_HEALTH_ALERT",
          metadata: {
            fingerprint,
            key: alert.key,
            severity: alert.severity,
            title: alert.title,
            message: alert.message,
            metrics: alert.metrics,
            generatedAt: snapshot.generatedAt,
            windowMinutes: snapshot.windowMinutes,
          },
        },
      }),
      prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: "automation",
          message,
        })),
      }),
    ]);

    emitted += 1;
  }

  return { emitted, skipped, alerts: snapshot.alerts };
}

export type { AutomationHealthAlert, AutomationHealthSnapshot };
