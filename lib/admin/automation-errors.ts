import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { executeAutomationRun } from "@/lib/automation/engine";
import { readFlowSnapshotFromRunOutput } from "@/lib/automation/versioning";
import { sanitizeAutomationPayload } from "@/lib/automation/redaction";

export type AutomationRecoveryStatus = "FAILED" | "RETRYING" | "RESOLVED";
export type AutomationErrorsRange = "1h" | "24h" | "7d" | "custom";
export type AutomationErrorsSort = "created_desc" | "created_asc";

export type AutomationErrorsListInput = {
  q?: string | null;
  flowId?: string | null;
  subscriber?: string | null;
  tenant?: string | null;
  status?: AutomationRecoveryStatus | null;
  range?: AutomationErrorsRange;
  from?: Date | null;
  to?: Date | null;
  pageSize: number;
  cursor?: string | null;
  sort: AutomationErrorsSort;
};

export type AutomationErrorsListItem = {
  id: string;
  runId: string;
  flow: { id: string; name: string; businessId: string | null; tenantName: string | null };
  subscriber: { id: string; name: string; email: string; publicId: string | null };
  status: AutomationRecoveryStatus;
  errorSummary: string;
  createdAt: string;
  retryCount: number;
  lastRetryAt: string | null;
  latestAttemptAt: string | null;
  latestAttemptRunId: string | null;
};

export type AutomationErrorsDetail = {
  id: string;
  status: AutomationRecoveryStatus;
  retryCount: number;
  lastRetryAt: string | null;
  runId: string;
  flow: { id: string; name: string };
  subscriber: { id: string; email: string };
  tenant: { id: string | null; name: string | null };
  trigger: string;
  created: string;
  failedStep: {
    stepId: string | null;
    stepIndex: number | null;
    stepType: string | null;
    transient: boolean;
  } | null;
  errorMessage: string;
  stackTrace: string | null;
  sanitizedInputPayload: Record<string, unknown>;
  flowConfigurationSnapshot: Record<string, unknown>;
  inputPayload: Record<string, unknown>;
  flowSnapshot: Record<string, unknown>;
  resumeState: Record<string, unknown>;
  relatedLinks: {
    tenant: string | null;
    subscriber: string | null;
    flow: string | null;
  };
  stepsTimeline: Array<{
    id: string;
    stepKey: string;
    stepType: string;
    status: "STARTED" | "SUCCESS" | "FAILED" | "SKIPPED";
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    errorMessage: string | null;
    errorCode: string | null;
    safeOutput: Record<string, unknown> | null;
  }>;
  recoveryAttempts: Array<{
    id: string;
    actorAdminId: string;
    actorAdminName: string | null;
    actorIp: string | null;
    createdAt: string;
    resultStatus: "STARTED" | "BLOCKED" | "SUCCEEDED" | "FAILED";
    newRunId: string | null;
    blockReason: string | null;
    reason: string | null;
  }>;
  runMetadata: {
    runId: string;
    flowName: string;
    flowId: string;
    subscriberId: string;
    subscriberEmail: string;
    tenantId: string | null;
    tenantName: string | null;
    triggerType: string;
    createdAt: string;
    latestAttemptAt: string | null;
    latestAttemptRunId: string | null;
  };
  error: {
    message: string;
    stackTrace: string | null;
  };
  executionContext: {
    inputPayload: Record<string, unknown>;
    flowSnapshot: Record<string, unknown>;
    resumeState: Record<string, unknown>;
  };
  replayHistory: Array<{
    id: string;
    status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
    createdAt: string;
    completedAt: string | null;
  }>;
};

export type AutomationErrorsListResult = {
  summary: {
    failedRuns24h: number;
    impactedFlows24h: number;
    impactedSubscribers24h: number;
    latestFailureAt: string | null;
    counters: {
      automation_failures_total: number;
      automation_retries_total: number;
      automation_replays_total: number;
      automation_recovered_total: number;
    };
  };
  topImpactedFlows: Array<{ flowId: string; flowName: string; failureCount: number }>;
  items: AutomationErrorsListItem[];
  hasMore: boolean;
  nextCursor: string | null;
  pageSize: number;
  total: number;
};

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_REPLAYS_PER_ROOT = 3;
const MIN_REPLAY_GAP_MS = 60_000;

type RootRunWithReplay = Prisma.AutomationRunGetPayload<{
  include: {
    flow: { include: { business: { select: { id: true; name: true } } } };
    user: { select: { id: true; name: true; email: true; publicId: true } };
    replayRuns: {
      select: {
        id: true;
        runStatus: true;
        createdAt: true;
        completedAt: true;
        logs: true;
        output: true;
      };
      orderBy: { createdAt: "desc" };
      take: 1;
    };
    _count: { select: { replayRuns: true } };
  };
}>;

type ReplayAttemptStatus = "STARTED" | "BLOCKED" | "SUCCEEDED" | "FAILED";

function encodeCursor(input: { id: string; createdAt: string }) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function decodeCursor(value?: string | null): { id: string; createdAt: Date } | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      id?: string;
      createdAt?: string;
    };
    const id = String(parsed.id || "").trim();
    const createdAt = new Date(String(parsed.createdAt || ""));
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { id, createdAt };
  } catch {
    return null;
  }
}

function parseTimeWindow(input: {
  range?: AutomationErrorsRange;
  from?: Date | null;
  to?: Date | null;
}) {
  const now = new Date();
  if (input.range === "custom") {
    const from = input.from && !Number.isNaN(input.from.getTime()) ? input.from : null;
    const to = input.to && !Number.isNaN(input.to.getTime()) ? input.to : null;
    return { from, to };
  }
  if (input.range === "1h") return { from: new Date(now.getTime() - 60 * 60 * 1000), to: null };
  if (input.range === "7d") return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: null };
  return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: null };
}

function extractLatestError(logs: unknown): { message: string; stackTrace: string | null } {
  const redactText = (value: string) =>
    value
      .replace(/(api[_-]?key\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]")
      .replace(/(token\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]")
      .replace(/(password\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]")
      .replace(/(cookie\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]");

  if (!Array.isArray(logs)) return { message: "Unknown automation failure", stackTrace: null };
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const row = logs[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const entry = row as Record<string, unknown>;
    const error = String(entry.error || "").trim();
    if (!error) continue;
    const sanitizedError = redactText(error);
    const firstLine = sanitizedError.split(/\r?\n/)[0]?.trim() || "Automation step failed";
    return {
      message: firstLine.slice(0, 220),
      stackTrace: sanitizedError.includes("\n") ? sanitizedError : null,
    };
  }
  return { message: "Automation execution failed", stackTrace: null };
}

function extractFailedStepFromLogs(logs: unknown): {
  stepId: string | null;
  stepIndex: number | null;
  stepType: string | null;
  transient: boolean;
} | null {
  if (!Array.isArray(logs)) return null;
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const row = logs[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const entry = row as Record<string, unknown>;
    const result = String(entry.result || "").toLowerCase();
    if (result !== "failed" && result !== "retry-exhausted") continue;
    return {
      stepId: entry.stepId ? String(entry.stepId) : null,
      stepIndex: Number.isFinite(Number(entry.stepIndex)) ? Number(entry.stepIndex) : null,
      stepType: entry.step ? String(entry.step) : null,
      transient: Boolean(entry.transient),
    };
  }
  return null;
}

function getRecoveryStatusFromReplay(
  latestReplay: { runStatus: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" } | null,
  rootRecoveryStatus?: string | null
): AutomationRecoveryStatus {
  if (rootRecoveryStatus === "RESOLVED") return "RESOLVED";
  if (rootRecoveryStatus === "RETRYING") return "RETRYING";
  if (rootRecoveryStatus === "FAILED") return "FAILED";
  if (!latestReplay) return "FAILED";
  if (latestReplay.runStatus === "SUCCESS") return "RESOLVED";
  if (latestReplay.runStatus === "PENDING" || latestReplay.runStatus === "RUNNING") return "RETRYING";
  return "FAILED";
}

function mapRootRunToListItem(run: RootRunWithReplay): AutomationErrorsListItem {
  const latestReplay = run.replayRuns[0] || null;
  const latestAttempt = latestReplay || run;
  const error = extractLatestError(latestAttempt.logs);
  return {
    id: run.id,
    runId: run.id,
    flow: {
      id: run.flowId,
      name: run.flow?.title || "Unknown flow",
      businessId: run.flow?.businessId || null,
      tenantName: run.flow?.business?.name || null,
    },
    subscriber: {
      id: run.user.id,
      name: run.user.name,
      email: run.user.email,
      publicId: run.user.publicId || null,
    },
    status: getRecoveryStatusFromReplay(latestReplay, run.recoveryStatus),
    errorSummary: error.message,
    createdAt: run.createdAt.toISOString(),
    retryCount: run.retryCount,
    lastRetryAt: run.lastRetryAt ? run.lastRetryAt.toISOString() : null,
    latestAttemptAt: latestAttempt.createdAt.toISOString(),
    latestAttemptRunId: latestAttempt.id,
  };
}

function recoveryStatusWhere(status?: AutomationRecoveryStatus | null): Prisma.AutomationRunWhereInput | null {
  if (!status) return null;
  if (status === "RESOLVED") {
    return { replayRuns: { some: { runStatus: "SUCCESS" } } };
  }
  if (status === "RETRYING") {
    return {
      AND: [
        { replayRuns: { some: { runStatus: { in: ["PENDING", "RUNNING"] } } } },
        { replayRuns: { none: { runStatus: "SUCCESS" } } },
      ],
    };
  }
  return {
    replayRuns: {
      none: { runStatus: { in: ["PENDING", "RUNNING", "SUCCESS"] } },
    },
  };
}

function buildWhere(input: AutomationErrorsListInput): Prisma.AutomationRunWhereInput {
  const timeWindow = parseTimeWindow({ range: input.range, from: input.from, to: input.to });
  const andClauses: Prisma.AutomationRunWhereInput[] = [
    { runStatus: "FAILED", originalRunId: null },
  ];

  if (timeWindow.from || timeWindow.to) {
    andClauses.push({
      createdAt: {
        ...(timeWindow.from ? { gte: timeWindow.from } : {}),
        ...(timeWindow.to ? { lte: timeWindow.to } : {}),
      },
    });
  }

  if (input.flowId) andClauses.push({ flowId: input.flowId });

  const subscriber = String(input.subscriber || "").trim();
  if (subscriber) {
    andClauses.push({
      OR: [
        { userId: subscriber },
        { user: { email: { contains: subscriber, mode: "insensitive" } } },
        { user: { name: { contains: subscriber, mode: "insensitive" } } },
        { user: { publicId: { contains: subscriber, mode: "insensitive" } } },
      ],
    });
  }

  const tenant = String(input.tenant || "").trim();
  if (tenant) {
    andClauses.push({
      OR: [
        { flow: { businessId: tenant } },
        { flow: { business: { name: { contains: tenant, mode: "insensitive" } } } },
      ],
    });
  }

  const q = String(input.q || "").trim();
  if (q) {
    andClauses.push({
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { flow: { title: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  const statusWhere = recoveryStatusWhere(input.status);
  if (statusWhere) {
    andClauses.push(statusWhere);
  } else {
    andClauses.push({
      OR: [
        { replayRuns: { some: { runStatus: { in: ["PENDING", "RUNNING"] } } } },
        { replayRuns: { none: { runStatus: "SUCCESS" } } },
      ],
    });
  }

  return andClauses.length > 1 ? { AND: andClauses } : andClauses[0];
}

export async function queryAutomationErrors(input: AutomationErrorsListInput): Promise<AutomationErrorsListResult> {
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(input.pageSize || DEFAULT_PAGE_SIZE)));
  const where = buildWhere(input);
  const cursor = decodeCursor(input.cursor);
  const sortDesc = input.sort !== "created_asc";
  const cursorWhere =
    cursor
      ? sortDesc
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {
            OR: [
              { createdAt: { gt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { gt: cursor.id } },
            ],
          }
      : null;

  const listWhere = cursorWhere ? { AND: [where, cursorWhere] as Prisma.AutomationRunWhereInput[] } : where;
  const metricsSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const metricsWhere: Prisma.AutomationRunWhereInput = {
    runStatus: "FAILED",
    originalRunId: null,
    createdAt: { gte: metricsSince },
  };

  const [total, runs, metricsRows, topFlowBuckets, retriesAgg, replaysTotal, recoveredTotal, allFailuresTotal] = await prisma.$transaction([
    prisma.automationRun.count({ where }),
    prisma.automationRun.findMany({
      where: listWhere,
      take: pageSize + 1,
      orderBy: [{ createdAt: sortDesc ? "desc" : "asc" }, { id: sortDesc ? "desc" : "asc" }],
      include: {
        flow: {
          include: {
            business: { select: { id: true, name: true } },
          },
        },
        user: {
          select: { id: true, name: true, email: true, publicId: true },
        },
        replayRuns: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            runStatus: true,
            createdAt: true,
            completedAt: true,
            logs: true,
            output: true,
          },
        },
        _count: { select: { replayRuns: true } },
      },
    }),
    prisma.$queryRaw<Array<{ failed_count: bigint; flow_count: bigint; subscriber_count: bigint; latest_failure: Date | null }>>(
      Prisma.sql`
        SELECT
          COUNT(*)::bigint AS failed_count,
          COUNT(DISTINCT "flowId")::bigint AS flow_count,
          COUNT(DISTINCT "userId")::bigint AS subscriber_count,
          MAX("createdAt") AS latest_failure
        FROM "AutomationRun"
        WHERE "runStatus" = 'FAILED'::"AutomationRunStatus"
          AND "original_run_id" IS NULL
          AND "createdAt" >= ${metricsSince}
      `
    ),
    prisma.automationRun.groupBy({
      by: ["flowId"],
      where: metricsWhere,
      _count: { flowId: true },
      orderBy: { _count: { flowId: "desc" } },
      take: 6,
    }),
    prisma.automationRun.aggregate({
      _sum: { retryCount: true },
      where: { originalRunId: null },
    }),
    prisma.automationRun.count({
      where: { originalRunId: { not: null } },
    }),
    prisma.automationRun.count({
      where: { originalRunId: { not: null }, runStatus: "SUCCESS" },
    }),
    prisma.automationRun.count({
      where: { originalRunId: null, runStatus: "FAILED" },
    }),
  ]);

  const metrics = metricsRows[0] || {
    failed_count: BigInt(0),
    flow_count: BigInt(0),
    subscriber_count: BigInt(0),
    latest_failure: null,
  };

  const hasMore = runs.length > pageSize;
  const pageRuns = hasMore ? runs.slice(0, pageSize) : runs;
  const flowIds = topFlowBuckets.map((row) => row.flowId);
  const topFlowMap = flowIds.length
    ? new Map(
        (
          await prisma.automationFlow.findMany({
            where: { id: { in: flowIds } },
            select: { id: true, title: true },
          })
        ).map((row) => [row.id, row.title])
      )
    : new Map<string, string>();

  const items = pageRuns.map((run) => mapRootRunToListItem(run as RootRunWithReplay));
  const lastRow = items[items.length - 1];

  return {
    summary: {
      failedRuns24h: Number(metrics.failed_count),
      impactedFlows24h: Number(metrics.flow_count),
      impactedSubscribers24h: Number(metrics.subscriber_count),
      latestFailureAt: metrics.latest_failure ? metrics.latest_failure.toISOString() : null,
      counters: {
        automation_failures_total: allFailuresTotal,
        automation_retries_total: Number(retriesAgg._sum.retryCount || 0),
        automation_replays_total: replaysTotal,
        automation_recovered_total: recoveredTotal,
      },
    },
    topImpactedFlows: topFlowBuckets.map((row) => {
      const count =
        row._count && typeof row._count === "object" && !Array.isArray(row._count)
          ? Number((row._count as Record<string, unknown>).flowId || 0)
          : 0;
      return {
        flowId: row.flowId,
        flowName: topFlowMap.get(row.flowId) || "Unknown flow",
        failureCount: count,
      };
    }),
    items,
    hasMore,
    nextCursor: hasMore && lastRow ? encodeCursor({ id: lastRow.id, createdAt: lastRow.createdAt }) : null,
    pageSize,
    total,
  };
}

function normalizeExecutionContextPayload(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return {
      inputPayload: {},
      flowSnapshot: {},
      resumeState: {},
      triggerType: "Unknown",
    };
  }
  const raw = output as Record<string, unknown>;
  return {
    inputPayload: sanitizeAutomationPayload((raw.input as Record<string, unknown>) || {}),
    flowSnapshot: sanitizeAutomationPayload((raw.flowSnapshot as Record<string, unknown>) || {}),
    resumeState: sanitizeAutomationPayload((raw.resumeState as Record<string, unknown>) || {}),
    triggerType: String(raw.trigger || "Unknown"),
  };
}

export async function getAutomationErrorDetail(runId: string): Promise<AutomationErrorsDetail | null> {
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    select: { id: true, originalRunId: true },
  });
  if (!run) return null;
  const rootRunId = run.originalRunId || run.id;

  const root = await prisma.automationRun.findUnique({
    where: { id: rootRunId },
    include: {
      flow: { include: { business: { select: { id: true, name: true } } } },
      user: { select: { id: true, name: true, email: true, publicId: true } },
      replayRuns: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          runStatus: true,
          createdAt: true,
          completedAt: true,
          logs: true,
          output: true,
        },
      },
    },
  });
  if (!root) return null;

  const attemptRunIds = [root.id, ...root.replayRuns.map((entry) => entry.id)];
  const timelineRunId = (root.replayRuns.find((entry) => entry.runStatus === "FAILED") || root.replayRuns[0] || root).id;
  const recentErrors = await prisma.automationRunError.findMany({
    where: { runId: { in: attemptRunIds } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 25,
  });
  const stepsTimelineRows = await prisma.automationStepExecution.findMany({
    where: { runId: timelineRunId },
    orderBy: [{ stepIndex: "asc" }, { startedAt: "asc" }, { createdAt: "asc" }],
  });
  const replayAttempts = await prisma.automationReplayAttempt.findMany({
    where: { runId: root.id },
    include: {
      actorAdmin: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 25,
  });

  const latestReplay = root.replayRuns[0] || null;
  const latestAttempt = latestReplay || root;
  const failedAttempt =
    root.replayRuns.find((entry) => entry.runStatus === "FAILED") ||
    (root.runStatus === "FAILED" ? root : null);
  const latestErrorRow = recentErrors[0] || null;
  const failure = latestErrorRow
    ? {
        message: String(latestErrorRow.message || "Automation step failed").slice(0, 220),
        stackTrace: latestErrorRow.stackTrace ? String(latestErrorRow.stackTrace) : null,
      }
    : extractLatestError((failedAttempt || latestAttempt).logs);
  const execution = normalizeExecutionContextPayload((failedAttempt || root).output);
  const failedStep =
    latestErrorRow
      ? {
          stepId: latestErrorRow.stepId || null,
          stepIndex: latestErrorRow.stepIndex ?? null,
          stepType: latestErrorRow.errorType || null,
          transient: Boolean(latestErrorRow.transient),
        }
      : extractFailedStepFromLogs((failedAttempt || latestAttempt).logs);

  return {
    id: root.id,
    status: getRecoveryStatusFromReplay(latestReplay, root.recoveryStatus),
    retryCount: root.retryCount,
    lastRetryAt: root.lastRetryAt ? root.lastRetryAt.toISOString() : null,
    runId: root.id,
    flow: {
      id: root.flowId,
      name: root.flow?.title || "Unknown flow",
    },
    subscriber: {
      id: root.user.id,
      email: root.user.email,
    },
    tenant: {
      id: root.flow?.businessId || null,
      name: root.flow?.business?.name || null,
    },
    trigger: execution.triggerType,
    created: root.createdAt.toISOString(),
    failedStep,
    errorMessage: failure.message,
    stackTrace: failure.stackTrace,
    sanitizedInputPayload: execution.inputPayload,
    flowConfigurationSnapshot: execution.flowSnapshot,
    inputPayload: execution.inputPayload,
    flowSnapshot: execution.flowSnapshot,
    resumeState: execution.resumeState,
    relatedLinks: {
      tenant: root.flow?.businessId ? `/admin/tenants/${root.flow.businessId}` : null,
      subscriber: root.user.id ? `/admin/users` : null,
      flow: root.flowId ? `/dashboard/automations/${root.flowId}` : null,
    },
    stepsTimeline: stepsTimelineRows.map((step) => ({
      id: step.id,
      stepKey: step.stepId,
      stepType: step.stepType,
      status: step.status,
      startedAt: step.startedAt ? step.startedAt.toISOString() : null,
      finishedAt: step.finishedAt ? step.finishedAt.toISOString() : null,
      durationMs: step.durationMs ?? null,
      errorMessage: step.errorMessage || null,
      errorCode: step.errorCode || null,
      safeOutput:
        step.safeOutput && typeof step.safeOutput === "object" && !Array.isArray(step.safeOutput)
          ? sanitizeAutomationPayload(step.safeOutput as Record<string, unknown>)
          : null,
    })),
    recoveryAttempts: replayAttempts.map((attempt) => ({
      id: attempt.id,
      actorAdminId: attempt.actorAdminId,
      actorAdminName: attempt.actorAdmin?.name || null,
      actorIp: attempt.actorIp || null,
      createdAt: attempt.createdAt.toISOString(),
      resultStatus: attempt.resultStatus as ReplayAttemptStatus,
      newRunId: attempt.newRunId || null,
      blockReason: attempt.blockReason || null,
      reason: attempt.reason || null,
    })),
    runMetadata: {
      runId: root.id,
      flowName: root.flow?.title || "Unknown flow",
      flowId: root.flowId,
      subscriberId: root.user.id,
      subscriberEmail: root.user.email,
      tenantId: root.flow?.businessId || null,
      tenantName: root.flow?.business?.name || null,
      triggerType: execution.triggerType,
      createdAt: root.createdAt.toISOString(),
      latestAttemptAt: latestAttempt?.createdAt ? latestAttempt.createdAt.toISOString() : null,
      latestAttemptRunId: latestAttempt?.id || null,
    },
    error: {
      message: failure.message,
      stackTrace: failure.stackTrace,
    },
    executionContext: {
      inputPayload: execution.inputPayload,
      flowSnapshot: execution.flowSnapshot,
      resumeState: execution.resumeState,
    },
    replayHistory: root.replayRuns.map((entry) => ({
      id: entry.id,
      status: entry.runStatus,
      createdAt: entry.createdAt.toISOString(),
      completedAt: entry.completedAt ? entry.completedAt.toISOString() : null,
    })),
  };
}

function buildReplayMeta(input: {
  replayInput: Record<string, unknown>;
  rootRunId: string;
  replayKey: string;
}) {
  return {
    trigger: "Replay",
    source: "Admin",
    input: sanitizeAutomationPayload(input.replayInput),
    idempotencyKey: input.replayKey,
    originalRunId: input.rootRunId,
    event: null,
    resumeState: {
      lastCompletedStepIndex: -1,
      retryState: {},
      updatedAt: new Date().toISOString(),
      nextStepIndex: undefined,
      nextRunAt: null,
    },
  } as Prisma.InputJsonValue;
}

function parseInputPayload(output: unknown) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return {};
  const raw = output as Record<string, unknown>;
  if (!raw.input || typeof raw.input !== "object" || Array.isArray(raw.input)) return {};
  return raw.input as Record<string, unknown>;
}

export async function replayAutomationErrorRun(input: {
  runId: string;
  adminId: string;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}): Promise<
  | {
      ok: true;
      rootRunId: string;
      replayRunId: string;
      newRunId: string;
      attemptId: string;
      status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
      duplicateStart?: boolean;
      httpStatus?: 200 | 202;
    }
  | { ok: false; status: 404 | 409; code: string; error: string; attemptId?: string }
> {
  const now = new Date();
  const reason = String(input.reason || "").trim().slice(0, 280) || null;

  const reservation = await prisma.$transaction(async (tx) => {
    const requested = await tx.automationRun.findUnique({
      where: { id: input.runId },
      select: {
        id: true,
        originalRunId: true,
      },
    });
    if (!requested) {
      return { ok: false as const, status: 404 as const, code: "RUN_NOT_FOUND", error: "Run not found" };
    }

    const rootRunId = requested.originalRunId || requested.id;
    const lockKey = `automation-replay:${rootRunId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const root = await tx.automationRun.findUnique({
      where: { id: rootRunId },
      include: {
        flow: true,
      },
    });
    if (!root?.flow) {
      return { ok: false as const, status: 404 as const, code: "RUN_NOT_FOUND", error: "Run not found" };
    }

    const recentStartedAttempt = await tx.automationReplayAttempt.findFirst({
      where: {
        runId: rootRunId,
        resultStatus: "STARTED",
        createdAt: { gte: new Date(now.getTime() - 30_000) },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, newRunId: true },
    });
    if (recentStartedAttempt?.newRunId) {
      return {
        ok: true as const,
        rootRunId,
        flow: root.flow,
        replayRunId: recentStartedAttempt.newRunId,
        replayInput: parseInputPayload(root.output),
        replayKey: "",
        attemptId: recentStartedAttempt.id,
        duplicateStart: true as const,
      };
    }

    const latestAttempt = await tx.automationRun.findFirst({
      where: {
        OR: [{ id: rootRunId }, { originalRunId: rootRunId }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        runStatus: true,
        output: true,
      },
    });

    if (!latestAttempt) {
      return { ok: false as const, status: 404 as const, code: "RUN_NOT_FOUND", error: "Run not found" };
    }
    if (latestAttempt.runStatus === "SUCCESS" || root.recoveryStatus === "RESOLVED") {
      const blocked = await tx.automationReplayAttempt.create({
        data: {
          runId: rootRunId,
          actorAdminId: input.adminId,
          actorIp: input.ip || null,
          resultStatus: "BLOCKED",
          blockReason: "RUN_ALREADY_RESOLVED",
          reason,
        },
        select: { id: true },
      });
      return {
        ok: false as const,
        status: 409 as const,
        code: "RUN_ALREADY_RESOLVED",
        error: "Run already resolved",
        attemptId: blocked.id,
      };
    }
    if (latestAttempt.runStatus === "PENDING" || latestAttempt.runStatus === "RUNNING") {
      const blocked = await tx.automationReplayAttempt.create({
        data: {
          runId: rootRunId,
          actorAdminId: input.adminId,
          actorIp: input.ip || null,
          resultStatus: "BLOCKED",
          blockReason: "REPLAY_IN_PROGRESS",
          reason,
        },
        select: { id: true },
      });
      return {
        ok: false as const,
        status: 409 as const,
        code: "REPLAY_IN_PROGRESS",
        error: "Replay already in progress",
        attemptId: blocked.id,
      };
    }

    if ((root.retryCount || 0) >= MAX_REPLAYS_PER_ROOT) {
      const blocked = await tx.automationReplayAttempt.create({
        data: {
          runId: rootRunId,
          actorAdminId: input.adminId,
          actorIp: input.ip || null,
          resultStatus: "BLOCKED",
          blockReason: "REPLAY_LIMIT_REACHED",
          reason,
        },
        select: { id: true },
      });
      return {
        ok: false as const,
        status: 409 as const,
        code: "REPLAY_LIMIT_REACHED",
        error: "Replay limit reached",
        attemptId: blocked.id,
      };
    }
    if (root.lastRetryAt && now.getTime() - root.lastRetryAt.getTime() < MIN_REPLAY_GAP_MS) {
      const blocked = await tx.automationReplayAttempt.create({
        data: {
          runId: rootRunId,
          actorAdminId: input.adminId,
          actorIp: input.ip || null,
          resultStatus: "BLOCKED",
          blockReason: "REPLAY_COOLDOWN",
          reason,
        },
        select: { id: true },
      });
      return {
        ok: false as const,
        status: 409 as const,
        code: "REPLAY_COOLDOWN",
        error: "Replay cooldown active",
        attemptId: blocked.id,
      };
    }

    const nextRetryCount = (root.retryCount || 0) + 1;
    const replayKey = `automation-replay:${rootRunId}:${nextRetryCount}`;
    const replayInput = parseInputPayload(latestAttempt.output) || parseInputPayload(root.output);
    const replayMeta = buildReplayMeta({ replayInput, rootRunId, replayKey });
    await tx.automationRun.update({
      where: { id: rootRunId },
      data: {
        retryCount: { increment: 1 },
        lastRetryAt: now,
        recoveryStatus: "RETRYING",
      },
    });
    const replayRun = await tx.automationRun.create({
      data: {
        flowId: root.flowId,
        userId: root.userId,
        originalRunId: rootRunId,
        runStatus: "PENDING",
        recoveryStatus: "REPLAYED",
        logs: [],
        output: replayMeta,
      },
      select: { id: true },
    });
    const attempt = await tx.automationReplayAttempt.create({
      data: {
        runId: rootRunId,
        newRunId: replayRun.id,
        actorAdminId: input.adminId,
        actorIp: input.ip || null,
        resultStatus: "STARTED",
        reason,
      },
      select: { id: true },
    });

    return {
      ok: true as const,
      rootRunId,
      flow: root.flow,
      replayRunId: replayRun.id,
      replayInput,
      replayKey,
      attemptId: attempt.id,
    };
  });

  if (!reservation.ok) {
    if (reservation.attemptId && reservation.status === 409) {
      await prisma.activityLog.create({
        data: {
          userId: input.adminId,
          action: "AUTOMATION_RUN_REPLAY_BLOCKED",
          ip: input.ip || null,
          userAgent: input.userAgent || null,
          metadata: {
            runId: input.runId,
            attemptId: reservation.attemptId,
            code: reservation.code,
            reason,
            timestamp: new Date().toISOString(),
            requestId: input.requestId || null,
          },
        },
      });
    }
    return reservation;
  }

  if (reservation.duplicateStart) {
    return {
      ok: true,
      rootRunId: reservation.rootRunId,
      replayRunId: reservation.replayRunId,
      newRunId: reservation.replayRunId,
      attemptId: reservation.attemptId,
      status: "PENDING",
      duplicateStart: true,
      httpStatus: 202,
    };
  }

  await prisma.activityLog.create({
    data: {
      userId: input.adminId,
      action: "AUTOMATION_REPLAY_ATTEMPT",
      ip: input.ip || null,
      userAgent: input.userAgent || null,
      metadata: {
        runId: reservation.rootRunId,
        replayRunId: reservation.replayRunId,
        flowId: reservation.flow.id,
        timestamp: new Date().toISOString(),
        requestId: input.requestId || null,
      },
    },
  });

  const snapshot = readFlowSnapshotFromRunOutput((await prisma.automationRun.findUnique({
    where: { id: reservation.rootRunId },
    select: { output: true },
  }))?.output);
  const flowForReplay = snapshot
    ? {
        ...reservation.flow,
        title: snapshot.title,
        description: snapshot.description,
        steps: snapshot.steps,
      }
    : reservation.flow;

  let replayStatus: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" = "FAILED";
  try {
    const replayResult = await executeAutomationRun(flowForReplay, reservation.replayInput || {}, {
      trigger: "Replay",
      source: "Admin",
      resumeRunId: reservation.replayRunId,
      originalRunId: reservation.rootRunId,
      idempotencyKey: reservation.replayKey,
    });
    replayStatus = replayResult?.status || "FAILED";
  } catch {
    replayStatus = "FAILED";
  }

  await prisma.automationRun.update({
    where: { id: reservation.rootRunId },
    data: {
      recoveryStatus: replayStatus === "SUCCESS" ? "RESOLVED" : replayStatus === "FAILED" ? "FAILED" : "RETRYING",
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: input.adminId,
      action: "AUTOMATION_RUN_REPLAYED",
      ip: input.ip || null,
      userAgent: input.userAgent || null,
      metadata: {
        runId: reservation.rootRunId,
        replayRunId: reservation.replayRunId,
        flowId: reservation.flow.id,
        adminId: input.adminId,
        replayStatus,
        timestamp: new Date().toISOString(),
        requestId: input.requestId || null,
      },
    },
  });

  if (replayStatus === "SUCCESS") {
    await prisma.activityLog.create({
      data: {
        userId: input.adminId,
        action: "AUTOMATION_RECOVERED",
        metadata: {
          runId: reservation.rootRunId,
          replayRunId: reservation.replayRunId,
          flowId: reservation.flow.id,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  await prisma.automationReplayAttempt.updateMany({
    where: { id: reservation.attemptId },
    data: {
      resultStatus: replayStatus === "SUCCESS" ? "SUCCEEDED" : replayStatus === "FAILED" ? "FAILED" : "STARTED",
    },
  });

  return {
    ok: true,
    rootRunId: reservation.rootRunId,
    replayRunId: reservation.replayRunId,
    newRunId: reservation.replayRunId,
    attemptId: reservation.attemptId,
    status: replayStatus,
    httpStatus: 200,
  };
}
