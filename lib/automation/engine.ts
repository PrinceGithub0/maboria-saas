import "server-only";

import { AutomationFlow, AutomationRunStatus, Prisma } from "@prisma/client";
import OpenAI from "openai";
import { prisma } from "../prisma";
import { sendEmail } from "../email";
import { createInvoiceRecord, calculateTotals } from "../invoice";
import { normalizeVatSettings } from "../vat";
import { log } from "../logger";
import { meterUsage, autoInvoiceFromUsage, recoverFailedPayment } from "../billing";
import { enqueueJob } from "../jobs";
import { env } from "../env";
import { normalizeCurrency } from "../payments/currency-allowlist";
import { recordAnalyticsEvent } from "../analytics";
import { getWorkspaceScope } from "../entitlements";
import { VerifiedAutomationEvent } from "./verified-events";
import { AutomationFlowSnapshot, buildFlowSnapshot, readFlowSnapshotFromRunOutput } from "./versioning";
import { appendAutomationAuditEvent } from "./audit";
import { sanitizeAutomationPayload } from "./redaction";
import { shouldProcessEventForFlow } from "./ordering";

type Context = Record<string, any>;
type ExecuteAutomationMeta = {
  trigger?: string;
  source?: string;
  event?: VerifiedAutomationEvent | null;
  idempotencyKey?: string | null;
  resumeRunId?: string | null;
};
type RetryStepState = {
  attempts: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  exhausted?: boolean;
};
type DuplicateRunReservation = {
  id: string;
  runStatus: AutomationRunStatus;
  logs: Prisma.JsonValue;
  output: Prisma.JsonValue | null;
  completedAt: Date | null;
};
type ResumeState = {
  lastCompletedStepIndex: number;
  updatedAt: string;
  nextStepIndex?: number;
  nextRunAt?: string | null;
  retryState?: Record<string, RetryStepState>;
};
type ResumeRunRecord = {
  id: string;
  runStatus: AutomationRunStatus;
  logs: Prisma.JsonValue;
  output: Prisma.JsonValue | null;
  completedAt: Date | null;
};
type AutomationRunMeta = {
  trigger: string;
  source: string;
  input: Context;
  idempotencyKey: string | null;
  event: VerifiedAutomationEvent | null;
  flowSnapshot: AutomationFlowSnapshot;
  resumeState: ResumeState;
};

const asJsonObject = (value: Record<string, unknown>): Prisma.InputJsonValue =>
  value as Prisma.InputJsonValue;

const asJsonArray = (value: unknown): Prisma.InputJsonValue => (value as unknown[]) as Prisma.InputJsonValue;

const getResumeStateFromOutput = (output: unknown): ResumeState | null => {
  if (!output || typeof output !== "object") return null;
  const raw = (output as Record<string, unknown>)["resumeState"];
  if (!raw || typeof raw !== "object") return null;
  const lastCompletedStepIndex = Number((raw as Record<string, unknown>)["lastCompletedStepIndex"]);
  const updatedAt = String((raw as Record<string, unknown>)["updatedAt"] || "");
  if (!Number.isFinite(lastCompletedStepIndex)) return null;
  const rawRetryState = (raw as Record<string, unknown>)["retryState"];
  const retryState: Record<string, RetryStepState> = {};
  if (rawRetryState && typeof rawRetryState === "object") {
    for (const [key, value] of Object.entries(rawRetryState as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const attempts = Number((value as Record<string, unknown>)["attempts"]);
      if (!Number.isFinite(attempts)) continue;
      retryState[key] = {
        attempts,
        nextRetryAt: (value as Record<string, unknown>)["nextRetryAt"]
          ? String((value as Record<string, unknown>)["nextRetryAt"])
          : null,
        lastError: (value as Record<string, unknown>)["lastError"]
          ? String((value as Record<string, unknown>)["lastError"])
          : null,
        exhausted: Boolean((value as Record<string, unknown>)["exhausted"]),
      };
    }
  }

  return {
    lastCompletedStepIndex,
    updatedAt: updatedAt || new Date().toISOString(),
    nextStepIndex:
      Number.isFinite(Number((raw as Record<string, unknown>)["nextStepIndex"]))
        ? Number((raw as Record<string, unknown>)["nextStepIndex"])
        : undefined,
    nextRunAt: (raw as Record<string, unknown>)["nextRunAt"]
      ? String((raw as Record<string, unknown>)["nextRunAt"])
      : null,
    retryState,
  };
};

const normalizeDelayUnit = (value: unknown) => {
  const unit = String(value || "").toLowerCase();
  if (unit.startsWith("min")) return "minutes";
  if (unit.startsWith("hour")) return "hours";
  if (unit.startsWith("day")) return "days";
  return null;
};

const resolveStepDelayMs = (step: any, config: Record<string, any>) => {
  if (typeof config.delayMs === "number" && config.delayMs > 0) return config.delayMs;
  if (typeof step?.delayMs === "number" && step.delayMs > 0) return step.delayMs;
  const delayValue = Number(config.delayValue ?? config.val ?? step?.delayValue ?? step?.val);
  const delayUnit = normalizeDelayUnit(config.delayUnit ?? config.unit ?? step?.delayUnit ?? step?.unit);
  if (Number.isFinite(delayValue) && delayValue > 0 && delayUnit) {
    if (delayUnit === "minutes") return delayValue * 60_000;
    if (delayUnit === "hours") return delayValue * 3_600_000;
    return delayValue * 86_400_000;
  }
  return 0;
};

const resolveStepRunAt = (step: any, config: Record<string, any>, now: Date) => {
  const explicit =
    config.runAt ||
    config.executeAt ||
    config.notBefore ||
    step?.runAt ||
    step?.executeAt ||
    step?.notBefore;
  if (explicit) {
    const parsed = new Date(explicit);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const mode = String(config.mode ?? step?.mode ?? "").toLowerCase();
  const delayMs = resolveStepDelayMs(step, config);
  if (delayMs > 0 || mode === "after") {
    return new Date(now.getTime() + Math.max(delayMs, 60_000));
  }

  return null;
};

const isRetryableProviderStep = (stepType: string) =>
  stepType === "sendEmail" || stepType === "sendWhatsApp";

const getProviderRetryPolicy = (step: any, config: Record<string, any>) => {
  const rawAttempts = Number(config.retryAttempts ?? config.maxRetries ?? step?.retryAttempts ?? step?.maxRetries);
  const rawDelayMs = Number(config.retryDelayMs ?? config.delayMs ?? step?.retryDelayMs ?? step?.delayMs);
  const maxAttempts = Number.isFinite(rawAttempts) && rawAttempts > 0 ? Math.min(8, Math.floor(rawAttempts)) : 3;
  const baseDelayMs = Number.isFinite(rawDelayMs) && rawDelayMs > 0 ? Math.max(30_000, rawDelayMs) : 60_000;
  return { maxAttempts, baseDelayMs };
};

const FLOW_RUNS_PER_MINUTE_LIMIT = 180;
const USER_RUNS_PER_MINUTE_LIMIT = 600;
const PROVIDER_DISPATCH_PER_MINUTE_LIMIT = 120;
const API_CALLS_PER_MINUTE_LIMIT = 180;
const PROVIDER_FAILURE_ALERT_THRESHOLD = 3;
const PROVIDER_FAILURE_ALERT_WINDOW_MS = 30 * 60_000;

const trackRateLimitedAction = async ({
  userId,
  action,
  limitPerMinute,
  message,
}: {
  userId: string;
  action: string;
  limitPerMinute: number;
  message: string;
}) => {
  const since = new Date(Date.now() - 60_000);
  const recentCount = await prisma.activityLog.count({
    where: {
      userId,
      action,
      timestamp: { gte: since },
    },
  });
  if (recentCount >= limitPerMinute) {
    throw new Error(message);
  }
  await prisma.activityLog.create({
    data: {
      userId,
      action,
      metadata: {
        windowStartedAt: since.toISOString(),
        limitPerMinute,
        observedCount: recentCount + 1,
      },
    },
  });
};

const enforceRunBurstProtection = async ({
  flowId,
  flowTitle,
  userId,
}: {
  flowId: string;
  flowTitle: string;
  userId: string;
}) => {
  const since = new Date(Date.now() - 60_000);
  const [flowCount, userCount] = await prisma.$transaction([
    prisma.automationRun.count({
      where: {
        flowId,
        startedAt: { gte: since },
      },
    }),
    prisma.automationRun.count({
      where: {
        userId,
        startedAt: { gte: since },
      },
    }),
  ]);

  if (flowCount < FLOW_RUNS_PER_MINUTE_LIMIT && userCount < USER_RUNS_PER_MINUTE_LIMIT) {
    return;
  }

  await prisma.$transaction([
    prisma.automationFlow.updateMany({
      where: { id: flowId, status: "ACTIVE" },
      data: { status: "PAUSED" },
    }),
    prisma.activityLog.create({
      data: {
        userId,
        action: "AUTOMATION_BURST_PAUSE",
        metadata: {
          flowId,
          flowCount,
          userCount,
          flowLimit: FLOW_RUNS_PER_MINUTE_LIMIT,
          userLimit: USER_RUNS_PER_MINUTE_LIMIT,
          windowStartedAt: since.toISOString(),
        },
      },
    }),
    prisma.notification.create({
      data: {
        userId,
        type: "automation",
        message: `Automation ${flowTitle} was paused due to abnormal activity`,
      },
    }),
  ]);

  throw new Error("Automation paused due to abnormal activity. Review and resume manually.");
};

const recordProviderFailureAndNotifyIfRepeated = async ({
  userId,
  flowId,
  flowTitle,
  runId,
  stepType,
  stepIndex,
  attempts,
  maxAttempts,
  errorMessage,
}: {
  userId: string;
  flowId: string;
  flowTitle: string;
  runId: string;
  stepType: string;
  stepIndex: number;
  attempts: number;
  maxAttempts: number;
  errorMessage: string;
}) => {
  const now = new Date();
  const since = new Date(now.getTime() - PROVIDER_FAILURE_ALERT_WINDOW_MS);
  const failureAction = "AUTOMATION_PROVIDER_RETRY_EXHAUSTED";
  const alertAction = "AUTOMATION_PROVIDER_FAILURE_ALERT";

  await prisma.activityLog.create({
    data: {
      userId,
      action: failureAction,
      metadata: {
        flowId,
        runId,
        stepType,
        stepIndex,
        attempts,
        maxAttempts,
        error: errorMessage,
        windowStartedAt: since.toISOString(),
      },
    },
  });

  const recentFailures = await prisma.activityLog.count({
    where: {
      userId,
      action: failureAction,
      timestamp: { gte: since },
      AND: [
        { metadata: { path: ["flowId"], equals: flowId } },
        { metadata: { path: ["stepType"], equals: stepType } },
      ],
    },
  });

  if (recentFailures < PROVIDER_FAILURE_ALERT_THRESHOLD) return;

  const recentAlerts = await prisma.activityLog.count({
    where: {
      userId,
      action: alertAction,
      timestamp: { gte: since },
      AND: [
        { metadata: { path: ["flowId"], equals: flowId } },
        { metadata: { path: ["stepType"], equals: stepType } },
      ],
    },
  });

  if (recentAlerts > 0) return;

  await prisma.$transaction([
    prisma.activityLog.create({
      data: {
        userId,
        action: alertAction,
        metadata: {
          flowId,
          runId,
          stepType,
          failuresInWindow: recentFailures,
          threshold: PROVIDER_FAILURE_ALERT_THRESHOLD,
          windowMinutes: PROVIDER_FAILURE_ALERT_WINDOW_MS / 60_000,
        },
      },
    }),
    prisma.notification.create({
      data: {
        userId,
        type: "automation",
        message: `Repeated ${stepType} failures detected for automation ${flowTitle}. Check provider health.`,
      },
    }),
  ]);
};

const loadResumeRun = async ({
  flowId,
  userId,
  runId,
}: {
  flowId: string;
  userId: string;
  runId: string;
}) => {
  const lockKey = `automation:resume:${runId}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const run = await tx.automationRun.findFirst({
      where: { id: runId, flowId, userId, runStatus: "PENDING" },
      select: { id: true, runStatus: true, logs: true, output: true, completedAt: true },
    });
    if (!run) return null;
    await tx.automationRun.update({
      where: { id: run.id },
      data: {
        runStatus: "RUNNING",
        completedAt: null,
      },
    });
    return run as ResumeRunRecord;
  });
};

const reserveAutomationRun = async ({
  flowId,
  userId,
  startedAt,
  output,
  idempotencyKey,
}: {
  flowId: string;
  userId: string;
  startedAt: Date;
  output: Record<string, unknown>;
  idempotencyKey?: string | null;
}) => {
  if (!idempotencyKey) {
    const created = await prisma.automationRun.create({
      data: {
        flowId,
        userId,
        runStatus: "RUNNING",
        logs: [],
        output: asJsonObject(output),
        startedAt,
      },
      select: { id: true },
    });
    return { runId: created.id, duplicateRun: null as DuplicateRunReservation | null };
  }

  const lockKey = `automation:${flowId}:${idempotencyKey}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const duplicateRun = await tx.automationRun.findFirst({
      where: {
        flowId,
        output: {
          path: ["idempotencyKey"],
          equals: idempotencyKey,
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, runStatus: true, logs: true, output: true, completedAt: true },
    });
    if (duplicateRun) {
      return { runId: null, duplicateRun };
    }

    const created = await tx.automationRun.create({
      data: {
        flowId,
        userId,
        runStatus: "RUNNING",
        logs: [],
        output: asJsonObject(output),
        startedAt,
      },
      select: { id: true },
    });
    return { runId: created.id, duplicateRun: null as DuplicateRunReservation | null };
  });
};

export async function executeAutomationRun(
  flow: AutomationFlow & { userId: string },
  input: Context,
  meta?: ExecuteAutomationMeta
) {
  let logs: any[] = [];
  let status: AutomationRunStatus = "RUNNING";
  const runStartedAt = new Date();
  let flowSnapshot: AutomationFlowSnapshot = buildFlowSnapshot(flow);
  let lastCompletedStepIndex = -1;
  let resumeRetryState: Record<string, RetryStepState> = {};
  let runId: string | null = null;

  if (meta?.resumeRunId) {
    const resumed = await loadResumeRun({
      flowId: flow.id,
      userId: flow.userId,
      runId: meta.resumeRunId,
    });
    if (resumed) {
      runId = resumed.id;
      logs = Array.isArray(resumed.logs) ? [...resumed.logs] : [];
      const snapshot = readFlowSnapshotFromRunOutput(resumed.output);
      if (snapshot) {
        flowSnapshot = snapshot;
      }
      const resumeState = getResumeStateFromOutput(resumed.output);
      if (resumeState) {
        lastCompletedStepIndex = resumeState.lastCompletedStepIndex;
        resumeRetryState = resumeState.retryState || {};
      }
    }
    if (!runId) {
      return {
        status: "FAILED" as const,
        logs: [],
        context: {},
        skipped: true,
        reason: "resume_run_not_pending",
      };
    }
  }

  const runMeta: AutomationRunMeta = {
    trigger: meta?.trigger ?? "Manual",
    source: meta?.source ?? "Dashboard",
    input,
    idempotencyKey: meta?.idempotencyKey ?? null,
    event: meta?.event ?? null,
    flowSnapshot,
    resumeState: {
      lastCompletedStepIndex,
      retryState: resumeRetryState,
      updatedAt: new Date().toISOString(),
    },
  };
  const openai = new OpenAI({ apiKey: env.openaiKey });
  const usageScope = await getWorkspaceScope(flow.userId);
  const analyticsWorkspaceId = usageScope.businessId ?? flow.userId;
  let businessProfile: {
    businessName: string;
    country: string;
    defaultCurrency: string;
    businessAddress?: string | null;
    businessEmail?: string | null;
    businessPhone?: string | null;
    taxId?: string | null;
  } | null = null;

  if (!runId) {
    if (!meta?.resumeRunId && meta?.event) {
      const orderingKey = String(
        ((meta.event.metadata as Record<string, unknown> | undefined)?.orderingKey as string) || ""
      ).trim();
      if (orderingKey) {
        const orderingDecision = await shouldProcessEventForFlow({
          flowId: flow.id,
          eventType: meta.event.type,
          source: meta.event.source,
          orderingKey,
          occurredAt: meta.event.occurredAt,
          eventId: meta.event.eventId,
        });
        if (!orderingDecision.accept) {
          log("info", "automation_event_skipped", {
            reason: orderingDecision.reason || "stale_event",
            flowId: flow.id,
            userId: flow.userId,
            eventId: meta.event.eventId,
            eventType: meta.event.type,
            source: meta.event.source,
            orderingKey,
            occurredAt: meta.event.occurredAt,
            latestOccurredAt: orderingDecision.latestOccurredAt,
            latestEventId: orderingDecision.latestEventId,
          });
          return {
            status: "SUCCESS" as const,
            logs: [],
            context: {},
            skipped: true,
            reason: orderingDecision.reason || "stale_event",
            runId: null,
          };
        }
      }
    }

    if (!meta?.resumeRunId) {
      await enforceRunBurstProtection({
        flowId: flow.id,
        flowTitle: flow.title,
        userId: flow.userId,
      });
    }
    const reservation = await reserveAutomationRun({
      flowId: flow.id,
      userId: flow.userId,
      startedAt: runStartedAt,
      output: runMeta,
      idempotencyKey: meta?.idempotencyKey,
    });
    if (reservation.duplicateRun) {
      return {
        status: reservation.duplicateRun.runStatus,
        logs: Array.isArray(reservation.duplicateRun.logs) ? reservation.duplicateRun.logs : [],
        context: {},
        duplicate: true,
        runId: reservation.duplicateRun.id,
        output: reservation.duplicateRun.output,
      };
    }
    runId = reservation.runId;
  }

  try {
    const steps = (flowSnapshot.steps as Prisma.JsonValue as any[]) ?? [];
    const context: Context = { input };

    const pushLog = (entry: Record<string, any>) => {
      const sanitizedEntry = sanitizeAutomationPayload(entry);
      logs.push({
        timestamp: new Date().toISOString(),
        input: sanitizeAutomationPayload(context.input ?? input),
        ...(sanitizedEntry && typeof sanitizedEntry === "object" && !Array.isArray(sanitizedEntry)
          ? sanitizedEntry
          : { value: sanitizedEntry }),
      });
    };

    const persistProgress = async (completedStepIndex: number) => {
      if (!runId) return;
      lastCompletedStepIndex = completedStepIndex;
      const nextRetryState = { ...(runMeta.resumeState.retryState || {}) };
      delete nextRetryState[String(completedStepIndex)];
      runMeta.resumeState = {
        lastCompletedStepIndex,
        retryState: nextRetryState,
        updatedAt: new Date().toISOString(),
        nextStepIndex: undefined,
        nextRunAt: null,
      };
      await prisma.automationRun.update({
        where: { id: runId },
        data: {
          runStatus: "RUNNING",
          logs: asJsonArray(logs),
          output: asJsonObject(runMeta),
        },
      });
    };

    const scheduleProviderRetry = async ({
      stepIndex,
      stepType,
      step,
      config,
      error,
    }: {
      stepIndex: number;
      stepType: string;
      step: any;
      config: Record<string, any>;
      error: Error;
    }) => {
      if (!runId) return false;
      const { maxAttempts, baseDelayMs } = getProviderRetryPolicy(step, config);
      const retryKey = String(stepIndex);
      const previous = runMeta.resumeState.retryState?.[retryKey];
      const attempts = (previous?.attempts ?? 0) + 1;
      const retryState = { ...(runMeta.resumeState.retryState || {}) };

      if (attempts >= maxAttempts) {
        retryState[retryKey] = {
          attempts,
          exhausted: true,
          nextRetryAt: null,
          lastError: error.message,
        };
        runMeta.resumeState = {
          lastCompletedStepIndex: stepIndex - 1,
          nextStepIndex: stepIndex,
          nextRunAt: null,
          retryState,
          updatedAt: new Date().toISOString(),
        };
        pushLog({
          stepIndex,
          step: stepType,
          result: "retry-exhausted",
          attempts,
          maxAttempts,
          error: error.message,
        });
        await recordProviderFailureAndNotifyIfRepeated({
          userId: flow.userId,
          flowId: flow.id,
          flowTitle: flow.title,
          runId,
          stepType,
          stepIndex,
          attempts,
          maxAttempts,
          errorMessage: error.message,
        });
        return false;
      }

      const delayMs = Math.min(baseDelayMs * Math.max(1, attempts), 15 * 60_000);
      const nextRunAt = new Date(Date.now() + delayMs);
      retryState[retryKey] = {
        attempts,
        exhausted: false,
        nextRetryAt: nextRunAt.toISOString(),
        lastError: error.message,
      };
      runMeta.resumeState = {
        lastCompletedStepIndex: stepIndex - 1,
        nextStepIndex: stepIndex,
        nextRunAt: nextRunAt.toISOString(),
        retryState,
        updatedAt: new Date().toISOString(),
      };
      pushLog({
        stepIndex,
        step: stepType,
        result: "retry-scheduled",
        attempts,
        maxAttempts,
        nextRunAt: nextRunAt.toISOString(),
        error: error.message,
      });
      status = "PENDING";
      await prisma.automationRun.update({
        where: { id: runId },
        data: {
          runStatus: "PENDING",
          logs: asJsonArray(logs),
          output: asJsonObject(runMeta),
          completedAt: null,
        },
      });
      return true;
    };

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
      if (stepIndex <= lastCompletedStepIndex) continue;
      const step = steps[stepIndex];
      const stepType = typeof step === "string" ? step : step?.type;
      const config =
        step && typeof step === "object" && !Array.isArray(step) ? (step as any).config || {} : {};
      if (!stepType) {
        pushLog({ stepIndex, step: "unknown", error: "Invalid step configuration" });
        await persistProgress(stepIndex);
        continue;
      }
      const stepRunAt = resolveStepRunAt(step, config, new Date());
      if (stepRunAt && stepRunAt.getTime() > Date.now()) {
        runMeta.resumeState = {
          lastCompletedStepIndex: stepIndex - 1,
          nextStepIndex: stepIndex,
          nextRunAt: stepRunAt.toISOString(),
          retryState: { ...(runMeta.resumeState.retryState || {}) },
          updatedAt: new Date().toISOString(),
        };
        pushLog({
          stepIndex,
          step: stepType,
          result: "scheduled",
          scheduledFor: stepRunAt.toISOString(),
        });
        status = "PENDING";
        break;
      }
      log("info", "Running step", { type: stepType, flowId: flow.id, stepIndex });
      try {
        switch (stepType) {
          case "parseText": {
            const text: string = input.text || "";
            context.parsed = { length: text.length, preview: text.slice(0, 120) };
            pushLog({ stepIndex, step: stepType, result: context.parsed });
            break;
          }
          case "condition": {
            const field = config.field;
            const equals = config.equals;
            if (!field) {
              pushLog({ stepIndex, step: stepType, skipped: true, reason: "Missing condition field" });
              break;
            }
            if (context[field] !== equals) {
              pushLog({ stepIndex, step: stepType, skipped: true });
              break;
            }
            break;
          }
          case "extractData": {
            const text: string = input.text || "";
            const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
            context.extracted = { email };
            pushLog({ stepIndex, step: stepType, result: context.extracted });
            break;
          }
          case "callApi": {
            if (!config.url) {
              pushLog({ stepIndex, step: stepType, skipped: true, reason: "Missing API url" });
              break;
            }
            await trackRateLimitedAction({
              userId: flow.userId,
              action: "AUTOMATION_API_DISPATCH",
              limitPerMinute: API_CALLS_PER_MINUTE_LIMIT,
              message: "API action rate limit exceeded. Please retry shortly.",
            });
            const response = await fetch(config.url, {
              method: config.method || "GET",
              headers: config.headers,
              body: config.body ? JSON.stringify(config.body) : undefined,
            });
            const data = await response.json();
            context.api = data;
            pushLog({ stepIndex, step: stepType, result: data });
            break;
          }
          case "databaseWrite": {
            await prisma.activityLog.create({
              data: { action: config.action || "DB_WRITE", metadata: config.payload },
            });
            pushLog({ stepIndex, step: stepType, result: "written" });
            break;
          }
          case "webhook": {
            if (!config.url) {
              pushLog({ stepIndex, step: stepType, skipped: true, reason: "Missing webhook url" });
              break;
            }
            await fetch(config.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(context),
            });
            pushLog({ stepIndex, step: stepType, result: "webhook-sent" });
            break;
          }
          case "generateInvoice": {
            const invoiceNumber = `INV-${Date.now()}`;
            const items = Array.isArray(config.items)
              ? config.items
              : [{ name: "Automation Service", quantity: 1, price: 10000 }];
            const invoice = await createInvoiceRecord({
              userId: flow.userId,
              invoiceNumber,
              currency: config.currency || "USD",
              items,
              status: "SENT",
              discount: config.discount ?? 0,
            });
            context.invoice = invoice;
            pushLog({ stepIndex, step: stepType, result: { invoiceNumber } });
            break;
          }
          case "sendEmail": {
            const to = context.extracted?.email || config.to;
            if (!to) {
              pushLog({ stepIndex, step: stepType, skipped: true, reason: "Missing recipient email" });
              break;
            }
            await trackRateLimitedAction({
              userId: flow.userId,
              action: "AUTOMATION_EMAIL_DISPATCH",
              limitPerMinute: PROVIDER_DISPATCH_PER_MINUTE_LIMIT,
              message: "Email dispatch rate limit exceeded. Retrying shortly.",
            });
            await sendEmail({
              to,
              subject: config.subject || "Automation Update",
              html: config.html || `<p>Automation ${flow.title} completed.</p>`,
            });
            pushLog({ stepIndex, step: stepType, result: { to } });
            break;
          }
          case "generateReport": {
            const totals = context.invoice
              ? calculateTotals(
                  context.invoice.items as any[],
                  normalizeVatSettings({ enabled: false, rate: 0, mode: "exclusive" }),
                  0
                )
              : { total: 0 };
            const report = {
              title: flow.title,
              metrics: { totalInvoices: 1, totalValue: totals.total },
            };
            context.report = report;
            pushLog({ stepIndex, step: stepType, result: report });
            break;
          }
          case "aiTransform": {
            const prompt = config.prompt || "Summarize data";
            const text = input.text || JSON.stringify(context);
            const completion = await openai.responses.create({
              model: "gpt-4.1-mini",
              input: `Task: ${prompt}\n\nContext: ${text}`,
            });
            const aiResult = completion.output_text;
            const usageTokens =
              typeof completion.usage?.total_tokens === "number"
                ? completion.usage.total_tokens
                : (completion.usage?.input_tokens ?? 0) + (completion.usage?.output_tokens ?? 0);
            const fallbackTokens = Math.max(1, Math.ceil((prompt.length + text.length + aiResult.length) / 4));
            const resolvedTokens = usageTokens > 0 ? usageTokens : fallbackTokens;
            await recordAnalyticsEvent({
              userId: flow.userId,
              workspaceId: analyticsWorkspaceId,
              orgId: usageScope.businessId ?? flow.userId,
              type: "AI_REQUEST",
              count: 1,
            });
            await recordAnalyticsEvent({
              userId: flow.userId,
              workspaceId: analyticsWorkspaceId,
              orgId: usageScope.businessId ?? flow.userId,
              type: "AI_TOKENS",
              count: resolvedTokens,
              tokenCount: resolvedTokens,
            });
            context.ai = aiResult;
            pushLog({ stepIndex, step: stepType, result: aiResult });
            break;
          }
          case "sendWhatsApp": {
            if (!config.to || !config.text) {
              pushLog({ stepIndex, step: stepType, skipped: true, reason: "Missing WhatsApp message details" });
              break;
            }
            if (!businessProfile) {
              businessProfile = await prisma.businessProfile.findUnique({
                where: { userId: flow.userId },
                select: {
                  businessName: true,
                  country: true,
                  defaultCurrency: true,
                  businessAddress: true,
                  businessEmail: true,
                  businessPhone: true,
                  taxId: true,
                },
              });
            }
            if (!businessProfile) {
              throw new Error("Business profile required before sending WhatsApp messages");
            }
            await trackRateLimitedAction({
              userId: flow.userId,
              action: "AUTOMATION_WHATSAPP_DISPATCH",
              limitPerMinute: PROVIDER_DISPATCH_PER_MINUTE_LIMIT,
              message: "WhatsApp dispatch rate limit exceeded. Retrying shortly.",
            });
            pushLog({ stepIndex, step: stepType, result: "queued-whatsapp" });
            enqueueJob("send-notification", {
              channel: "whatsapp",
              to: config.to,
              text: config.text,
              businessProfile,
            });
            break;
          }
          case "meterUsage": {
            await meterUsage(flow.userId, config.category || "automation", config.amount || 1, "monthly");
            pushLog({ stepIndex, step: stepType, result: "usage-metered" });
            break;
          }
          case "recoverPayment": {
            await recoverFailedPayment(flow.userId);
            pushLog({ stepIndex, step: stepType, result: "recovery-triggered" });
            break;
          }
          case "autoInvoice": {
            const invoice = await autoInvoiceFromUsage(flow.userId, normalizeCurrency(config.currency || "USD"));
            pushLog({ stepIndex, step: stepType, result: invoice?.invoiceNumber });
            break;
          }
          default:
            pushLog({ stepIndex, step: stepType, error: "Unknown step" });
        }
      } catch (stepError: any) {
        const normalizedError =
          stepError instanceof Error ? stepError : new Error(typeof stepError === "string" ? stepError : "Step failed");
        if (isRetryableProviderStep(stepType)) {
          const scheduledRetry = await scheduleProviderRetry({
            stepIndex,
            stepType,
            step,
            config,
            error: normalizedError,
          });
          if (scheduledRetry) {
            break;
          }
        }
        pushLog({ stepIndex, step: stepType, result: "failed", error: normalizedError.message });
        throw normalizedError;
      }
      await persistProgress(stepIndex);
    }

    if (status !== "PENDING") {
      status = "SUCCESS";
    }
    return { status, logs, context, runId };
  } catch (error: any) {
    status = "FAILED";
    logs.push({
      timestamp: new Date().toISOString(),
      input: sanitizeAutomationPayload(input),
      error: sanitizeAutomationPayload(error?.message || "run_failed"),
    });
    throw error;
  } finally {
    if (!runId) return;
    const runCompletedAt = new Date();
    const shouldFinalizeRun = status !== "PENDING";
    const operations: Prisma.PrismaPromise<any>[] = [
      prisma.automationRun.update({
        where: { id: runId },
        data: {
          runStatus: status,
          logs: asJsonArray(logs),
          output: asJsonObject(runMeta),
          completedAt: shouldFinalizeRun ? runCompletedAt : null,
        },
      }),
      prisma.activityLog.create({
        data: {
          userId: flow.userId,
          action: `AUTOMATION_RUN_${status}`,
          metadata: { flowId: flow.id, logsCount: logs.length },
        },
      }),
      prisma.notification.create({
        data: {
          userId: flow.userId,
          type: "automation",
          message:
            status === "PENDING"
              ? `Automation ${flow.title} scheduled next step`
              : `Automation ${flow.title} finished with ${status}`,
        },
      }),
    ];
    await prisma.$transaction(operations);
    try {
      await appendAutomationAuditEvent({
        userId: flow.userId,
        flowId: flow.id,
        runId,
        event: `RUN_${status}`,
        details: {
          logsCount: logs.length,
          trigger: runMeta.trigger,
          source: runMeta.source,
          idempotencyKey: runMeta.idempotencyKey,
          nextStepIndex: runMeta.resumeState?.nextStepIndex ?? null,
          nextRunAt: runMeta.resumeState?.nextRunAt ?? null,
        },
      });
    } catch (error) {
      log("error", "automation_audit_failed", { flowId: flow.id, runId, error });
    }
    if (status === "SUCCESS") {
      try {
        await recordAnalyticsEvent({
          userId: flow.userId,
          workspaceId: analyticsWorkspaceId,
          orgId: usageScope.businessId ?? flow.userId,
          type: "AUTOMATION_RUN",
          count: 1,
        });
      } catch (error) {
        log("error", "analytics_automation_failed", { flowId: flow.id, error });
      }
    }
  }
}
