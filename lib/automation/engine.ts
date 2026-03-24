import "server-only";

import { AutomationFlow, AutomationRunStatus, Prisma } from "@prisma/client";
import OpenAI from "openai";
import { prisma } from "../prisma";
import { sendNotificationsMail } from "../email";
import { createInvoiceRecord, calculateTotals, sendInvoiceEmailToCustomer } from "../invoice";
import { buildInvoiceIssuerCode, buildInvoiceNumberDraft } from "../invoice-number";
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
import { createOrGetCustomer } from "../customers";
import { applyLateFee } from "../late-fee";
import { getOrCreateSubscriberSetting, toLateFeeSettingsSnapshot } from "../subscriber-settings";
import { createAdminNotificationFromEvent } from "../admin/notifications";
import { assertSystemFlagEnabled } from "../system-flags";
import { logUserActivity } from "../user-activity";
import { emitSystemEvent } from "../system-events";
import { isAutomationTriggerMetadataStep } from "./step-kind";
import { getOrCreateInvoicePublicLink } from "../invoice-public-link";

type Context = Record<string, any>;
type ExecuteAutomationMeta = {
  trigger?: string;
  source?: string;
  event?: VerifiedAutomationEvent | null;
  idempotencyKey?: string | null;
  resumeRunId?: string | null;
  originalRunId?: string | null;
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
  originalRunId: string | null;
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
  originalRunId: string | null;
};
type AutomationRunMeta = {
  trigger: string;
  source: string;
  input: Context;
  idempotencyKey: string | null;
  originalRunId: string | null;
  event: VerifiedAutomationEvent | null;
  flowSnapshot: AutomationFlowSnapshot;
  resumeState: ResumeState;
};
type FailedStepRecord = {
  stepId: string;
  stepIndex: number;
  stepType: string;
  transient: boolean;
  attempts: number;
  error: Error;
};

type AutomationInvoiceContext = {
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    generatedAt: Date;
    currency: string;
    items: unknown;
    tax?: Prisma.Decimal | null;
    discount?: Prisma.Decimal | null;
    total?: Prisma.Decimal | null;
    lateFeeAmount?: Prisma.Decimal | null;
    lateFeeTotalAccumulated?: Prisma.Decimal | null;
    pdfUrl?: string | null;
    metadata?: Prisma.JsonValue | null;
    userId?: string;
  };
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    deliveryPreference: "EMAIL" | "WHATSAPP" | "BOTH" | null;
  } | null;
  paymentLink: string | null;
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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const readActionId = (config: Record<string, any>) => String(config.actionId || "").trim().toLowerCase();

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
};

const resolveInvoiceIdFromContext = (context: Context, input: Context) =>
  pickFirstString(
    context.input?.invoiceId,
    context.input?.invoice?.id,
    context.invoice?.id,
    input?.invoiceId,
    input?.invoice?.id
  );

const buildAutomationAiPrompt = (actionId: string, note: string) => {
  if (note) return note;
  switch (actionId) {
    case "improve_message":
      return "Improve this message for clarity, professionalism, and customer trust.";
    case "rewrite_tone":
      return "Rewrite this message in a warm, professional tone without changing the core meaning.";
    case "generate_auto_reply":
      return "Generate a concise, customer-ready reply based on this context.";
    case "generate_summary":
      return "Summarize this context into key points, decisions, and next steps.";
    default:
      return "";
  }
};

const buildAutomationEmailDraft = ({
  actionId,
  note,
  flowTitle,
  invoiceContext,
}: {
  actionId: string;
  note: string;
  flowTitle: string;
  invoiceContext: AutomationInvoiceContext | null;
}) => {
  const invoiceNumber = invoiceContext?.invoice.invoiceNumber || "your invoice";
  const paymentLink = invoiceContext?.paymentLink || null;
  switch (actionId) {
    case "notify_team_payment":
      return {
        subject: `Payment received for ${invoiceNumber}`,
        html: `<p>Payment has been confirmed for <strong>${escapeHtml(invoiceNumber)}</strong>.</p>`,
      };
    case "send_email":
      return {
        subject: note || `Update for ${invoiceNumber}`,
        html: `<p>${escapeHtml(note || `Here is an update for ${invoiceNumber}.`)}</p>`,
      };
    default:
      return {
        subject: note || `Automation update from ${flowTitle}`,
        html: `<p>${escapeHtml(note || `Automation ${flowTitle} completed successfully.`)}</p>${
          paymentLink
            ? `<p style="margin-top:12px">Payment link: <a href="${escapeHtml(paymentLink)}">${escapeHtml(
                paymentLink
              )}</a></p>`
            : ""
        }`,
      };
  }
};

const buildAutomationWhatsAppText = ({
  actionId,
  note,
  invoiceContext,
}: {
  actionId: string;
  note: string;
  invoiceContext: AutomationInvoiceContext | null;
}) => {
  const invoiceNumber = invoiceContext?.invoice.invoiceNumber || "your invoice";
  const paymentLink = invoiceContext?.paymentLink || null;
  if (note) return note;
  switch (actionId) {
    case "send_payment_reminder":
      return paymentLink
        ? `Reminder: invoice ${invoiceNumber} is still unpaid. You can pay here: ${paymentLink}`
        : `Reminder: invoice ${invoiceNumber} is still unpaid.`;
    case "send_payment_confirmation":
      return `Payment received for invoice ${invoiceNumber}. Thank you.`;
    case "send_failed_payment_message":
      return paymentLink
        ? `We could not complete payment for invoice ${invoiceNumber}. Please try again here: ${paymentLink}`
        : `We could not complete payment for invoice ${invoiceNumber}. Please try again.`;
    case "send_payment_link":
      return paymentLink
        ? `You can pay invoice ${invoiceNumber} here: ${paymentLink}`
        : `Payment link is not available for invoice ${invoiceNumber} yet.`;
    default:
      return `Update for invoice ${invoiceNumber}.`;
  }
};

const DEFAULT_STEP_RETRY_POLICY = {
  attempts: 4,
  delaysMs: [10_000, 30_000, 120_000, 300_000],
  maxDelayMs: 300_000,
  jitterRatio: 0.2,
} as const;

const TRANSIENT_ERROR_PATTERN =
  /(timeout|timed out|network|socket|econnreset|ecanceled|enotfound|eai_again|etimedout|ehostunreach|503|502|504|5\d\d|service unavailable|temporar(il)?y|rate limit|too many requests)/i;
const NON_RETRYABLE_ERROR_PATTERN =
  /(validation|invalid|missing|required|permission|forbidden|unauthorized|not allowed|not found|already exists|conflict)/i;

const IDEMPOTENT_SIDE_EFFECT_STEPS = new Set([
  "sendEmail",
  "sendWhatsApp",
  "generateInvoice",
  "recoverPayment",
  "autoInvoice",
  "webhook",
]);

const normalizeErrorMessage = (error: unknown) => {
  if (!error) return "unknown_error";
  if (error instanceof Error) return error.message || "unknown_error";
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const extractHttpStatus = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const raw = (error as Record<string, unknown>)["status"] ?? (error as Record<string, unknown>)["statusCode"];
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const isTransientStepError = (error: unknown) => {
  const message = normalizeErrorMessage(error);
  const status = extractHttpStatus(error);
  if (status && status >= 500) return true;
  if (status === 429) return true;
  if (NON_RETRYABLE_ERROR_PATTERN.test(message)) return false;
  return TRANSIENT_ERROR_PATTERN.test(message);
};

const getRetryDelayMs = (attemptNumber: number) => {
  const index = Math.max(0, Math.min(DEFAULT_STEP_RETRY_POLICY.delaysMs.length - 1, attemptNumber - 1));
  const baseDelay = DEFAULT_STEP_RETRY_POLICY.delaysMs[index] || DEFAULT_STEP_RETRY_POLICY.maxDelayMs;
  const jitterWindow = Math.floor(baseDelay * DEFAULT_STEP_RETRY_POLICY.jitterRatio);
  const jitterOffset = jitterWindow > 0 ? Math.floor(Math.random() * (jitterWindow * 2 + 1)) - jitterWindow : 0;
  return Math.max(1_000, Math.min(DEFAULT_STEP_RETRY_POLICY.maxDelayMs, baseDelay + jitterOffset));
};

const resolveStepId = (step: any, stepIndex: number, stepType: string) => {
  const explicit = String(step?.id || step?.stepId || "").trim();
  if (explicit) return explicit;
  return `${stepType}:${stepIndex}`;
};

const shouldTrackStepIdempotency = (stepType: string) => IDEMPOTENT_SIDE_EFFECT_STEPS.has(stepType);

const deriveRecoveryStatus = ({
  status,
  originalRunId,
}: {
  status: AutomationRunStatus;
  originalRunId: string | null;
}) => {
  if (originalRunId) return "REPLAYED" as const;
  if (status === "PENDING") return "RETRYING" as const;
  if (status === "FAILED") return "FAILED" as const;
  return "RESOLVED" as const;
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
      select: { id: true, runStatus: true, logs: true, output: true, completedAt: true, originalRunId: true },
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
  originalRunId,
}: {
  flowId: string;
  userId: string;
  startedAt: Date;
  output: Record<string, unknown>;
  idempotencyKey?: string | null;
  originalRunId?: string | null;
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
        originalRunId: originalRunId || null,
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
      select: { id: true, runStatus: true, logs: true, output: true, completedAt: true, originalRunId: true },
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
        originalRunId: originalRunId || null,
      },
      select: { id: true },
    });
    return { runId: created.id, duplicateRun: null as DuplicateRunReservation | null };
  });
};

const stepAlreadyExecuted = async ({
  originalRunId,
  stepId,
}: {
  originalRunId: string;
  stepId: string;
}) => {
  const existing = await prisma.automationStepExecution.findFirst({
    where: {
      originalRunId,
      stepId,
      status: "SUCCESS",
    },
    select: { id: true },
  });
  return Boolean(existing);
};

const markStepStarted = async ({
  runId,
  originalRunId,
  stepId,
  stepIndex,
  stepType,
}: {
  runId: string;
  originalRunId: string;
  stepId: string;
  stepIndex: number;
  stepType: string;
}) => {
  const executionKey = `${runId}:${stepIndex}`;
  await prisma.automationStepExecution.upsert({
    where: { executionKey },
    update: {
      status: "STARTED",
      startedAt: new Date(),
      finishedAt: null,
      durationMs: null,
      errorMessage: null,
      errorCode: null,
      safeOutput: Prisma.JsonNull,
      stepType,
      stepId,
      originalRunId,
    },
    create: {
      runId,
      executionKey,
      originalRunId,
      stepId,
      stepIndex,
      stepType,
      status: "STARTED",
      startedAt: new Date(),
    },
  });
};

const markStepFinished = async ({
  runId,
  stepIndex,
  status,
  startedAt,
  errorMessage,
  errorCode,
  safeOutput,
}: {
  runId: string;
  stepIndex: number;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  startedAt: number;
  errorMessage?: string | null;
  errorCode?: string | null;
  safeOutput?: unknown;
}) => {
  const executionKey = `${runId}:${stepIndex}`;
  await prisma.automationStepExecution.updateMany({
    where: { executionKey },
    data: {
      status,
      finishedAt: new Date(),
      durationMs: Math.max(0, Date.now() - startedAt),
      errorMessage: errorMessage ? String(errorMessage).slice(0, 1200) : null,
      errorCode: errorCode ? String(errorCode).slice(0, 120) : null,
      safeOutput:
        safeOutput === undefined
          ? Prisma.JsonNull
          : (sanitizeAutomationPayload(safeOutput) as Prisma.InputJsonValue),
    },
  });
};

export async function executeAutomationRun(
  flow: AutomationFlow & { userId: string },
  input: Context,
  meta?: ExecuteAutomationMeta
) {
  await assertSystemFlagEnabled("automation_enabled", "Automation engine is currently disabled.");

  let logs: any[] = [];
  let status: AutomationRunStatus = "RUNNING";
  const runStartedAt = new Date();
  let flowSnapshot: AutomationFlowSnapshot = buildFlowSnapshot(flow);
  let lastCompletedStepIndex = -1;
  let resumeRetryState: Record<string, RetryStepState> = {};
  let runId: string | null = null;
  let runOriginalRunId: string | null = meta?.originalRunId || null;
  let lastFailedStep: FailedStepRecord | null = null;

  if (meta?.resumeRunId) {
    const resumed = await loadResumeRun({
      flowId: flow.id,
      userId: flow.userId,
      runId: meta.resumeRunId,
    });
    if (resumed) {
      runId = resumed.id;
      runOriginalRunId = resumed.originalRunId || runOriginalRunId || null;
      if (!runOriginalRunId) {
        runOriginalRunId = runId;
      }
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
    originalRunId: runOriginalRunId,
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
  let ownerContact: { email: string | null; name: string | null } | null = null;
  let automationInvoiceContext: AutomationInvoiceContext | null | undefined;

  const ensureBusinessProfile = async () => {
    if (businessProfile) return businessProfile;
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
    return businessProfile;
  };

  const ensureOwnerContact = async () => {
    if (ownerContact) return ownerContact;
    ownerContact = await prisma.user.findUnique({
      where: { id: flow.userId },
      select: { email: true, name: true },
    });
    return ownerContact;
  };

  const ensureAutomationInvoiceContext = async (runtimeContext?: Context) => {
    if (automationInvoiceContext !== undefined) return automationInvoiceContext;
    const invoiceId = resolveInvoiceIdFromContext(runtimeContext || { input }, input);
    if (!invoiceId) {
      automationInvoiceContext = null;
      return automationInvoiceContext;
    }
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId: flow.userId },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        generatedAt: true,
        currency: true,
        items: true,
        tax: true,
        discount: true,
        total: true,
        lateFeeAmount: true,
        lateFeeTotalAccumulated: true,
        pdfUrl: true,
        metadata: true,
        userId: true,
        customer: {
          select: {
            name: true,
            email: true,
            phone: true,
            deliveryPreference: true,
          },
        },
      },
    });
    if (!invoice) {
      automationInvoiceContext = null;
      return automationInvoiceContext;
    }
    const publicLink = await getOrCreateInvoicePublicLink(invoice.id).catch(() => null);
    automationInvoiceContext = {
      invoice,
      customer: invoice.customer
        ? {
            name: invoice.customer.name ?? null,
            email: invoice.customer.email ?? null,
            phone: invoice.customer.phone ?? null,
            deliveryPreference: invoice.customer.deliveryPreference ?? null,
          }
        : null,
      paymentLink: publicLink
        ? `${env.appUrl}/api/invoice/pay/${encodeURIComponent(publicLink.token)}`
        : null,
    };
    return automationInvoiceContext;
  };

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
      originalRunId: runOriginalRunId,
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
    if (!runOriginalRunId && runId) {
      runOriginalRunId = runId;
      runMeta.originalRunId = runOriginalRunId;
    }
  }

  if (runId) {
    await logUserActivity({
      tenantId: usageScope.businessId ?? null,
      userId: flow.userId,
      actorId: flow.userId,
      eventType: "automation_triggered",
      metadata: {
        runId,
        flowId: flow.id,
        flowTitle: flow.title,
        trigger: runMeta.trigger,
        source: runMeta.source,
      },
    });
    await emitSystemEvent({
      tenantId: usageScope.businessId ?? null,
      userId: flow.userId,
      actorId: flow.userId,
      eventType: "automation_run_started",
      severity: "INFO",
      source: "AUTOMATION",
      entityType: "automation_run",
      entityId: runId,
      message: `Automation ${flow.title} started.`,
      metadata: {
        flowId: flow.id,
        flowTitle: flow.title,
        trigger: runMeta.trigger,
        source: runMeta.source,
        originalRunId: runOriginalRunId,
      },
    });
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

    const scheduleTransientRetry = async ({
      stepIndex,
      stepType,
      stepId,
      error,
    }: {
      stepIndex: number;
      stepType: string;
      stepId: string;
      error: Error;
    }) => {
      if (!runId) return { scheduled: false, attempts: 1 };
      const retryKey = String(stepIndex);
      const previous = runMeta.resumeState.retryState?.[retryKey];
      const attempts = (previous?.attempts ?? 0) + 1;
      const retryState = { ...(runMeta.resumeState.retryState || {}) };
      const maxRetries = DEFAULT_STEP_RETRY_POLICY.attempts;

      await prisma.activityLog.create({
        data: {
          userId: flow.userId,
          action: "AUTOMATION_RETRY_ATTEMPT",
          metadata: {
            runId,
            flowId: flow.id,
            stepId,
            stepType,
            stepIndex,
            attempt: attempts,
            maxRetries,
          },
        },
      });

      if (attempts > maxRetries) {
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
          maxRetries,
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
          maxAttempts: maxRetries,
          errorMessage: error.message,
        });
        return { scheduled: false, attempts };
      }

      const delayMs = getRetryDelayMs(attempts);
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
        maxRetries,
        nextRunAt: nextRunAt.toISOString(),
        error: error.message,
      });
      status = "PENDING";
      await prisma.automationRun.update({
        where: { id: runId },
        data: {
          runStatus: "PENDING",
          recoveryStatus: "RETRYING",
          logs: asJsonArray(logs),
          output: asJsonObject(runMeta),
          completedAt: null,
        },
      });
      return { scheduled: true, attempts };
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
      if (isAutomationTriggerMetadataStep(step)) {
        pushLog({
          stepIndex,
          step: stepType,
          result: "trigger-metadata-skip",
        });
        await persistProgress(stepIndex);
        continue;
      }
      const stepId = resolveStepId(step, stepIndex, stepType);
      const idempotencyScope = runOriginalRunId || runId;
      const stepStartedAt = Date.now();
      if (runId && idempotencyScope) {
        await markStepStarted({
          runId,
          originalRunId: idempotencyScope,
          stepId,
          stepIndex,
          stepType,
        });
      }
      if (runId && idempotencyScope && shouldTrackStepIdempotency(stepType)) {
        const alreadyExecuted = await stepAlreadyExecuted({
          originalRunId: idempotencyScope,
          stepId,
        });
        if (alreadyExecuted) {
          pushLog({
            stepIndex,
            step: stepType,
            stepId,
            result: "idempotent-skip",
          });
          if (runId) {
            await markStepFinished({
              runId,
              stepIndex,
              status: "SKIPPED",
              startedAt: stepStartedAt,
              safeOutput: { reason: "idempotent-skip" },
            });
          }
          await persistProgress(stepIndex);
          continue;
        }
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
        if (runId) {
          await markStepFinished({
            runId,
            stepIndex,
            status: "SKIPPED",
            startedAt: stepStartedAt,
            safeOutput: { reason: "scheduled", scheduledFor: stepRunAt.toISOString() },
          });
        }
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
            const contentType = String(response.headers.get("content-type") || "").toLowerCase();
            const data = contentType.includes("application/json")
              ? await response.json().catch(() => ({}))
              : await response.text().catch(() => "");
            if (!response.ok) {
              const apiError = new Error(
                `API call failed (${response.status})${typeof data === "string" && data ? `: ${data.slice(0, 180)}` : ""}`
              ) as Error & { status?: number };
              apiError.status = response.status;
              throw apiError;
            }
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
            const actionId = readActionId(config);
            if (actionId === "apply_late_fee") {
              const targetInvoiceId = String(
                config.invoiceId ||
                  config.targetInvoiceId ||
                  context.input?.invoiceId ||
                  input?.invoiceId ||
                  ""
              ).trim();
              if (!targetInvoiceId) {
                pushLog({
                  stepIndex,
                  step: stepType,
                  skipped: true,
                  reason: "Missing invoice id for late fee",
                });
                break;
              }

              const lateFeeSettings = toLateFeeSettingsSnapshot(
                await getOrCreateSubscriberSetting(flow.userId)
              );
              if (!lateFeeSettings.enabled) {
                pushLog({
                  stepIndex,
                  step: "applyLateFee",
                  skipped: true,
                  reason: "late_fee_disabled",
                });
                break;
              }
              if (!lateFeeSettings.allowAutomationLateFee) {
                pushLog({
                  stepIndex,
                  step: "applyLateFee",
                  skipped: true,
                  reason: "automation_late_fee_blocked",
                });
                break;
              }

              const lateFeeResult = await applyLateFee(targetInvoiceId, {
                triggeredBy: "automation",
                automationId: flow.id,
              });
              pushLog({
                stepIndex,
                step: "applyLateFee",
                result: lateFeeResult,
              });
              break;
            }
            if (actionId === "mark_as_paid" || actionId === "cancel_invoice") {
              pushLog({
                stepIndex,
                step: stepType,
                skipped: true,
                reason: `${actionId}_not_supported`,
              });
              break;
            }
            const invoiceNumber = buildInvoiceNumberDraft(
              new Date(),
              buildInvoiceIssuerCode(flow.userId, flow.userId)
            );
            const items = Array.isArray(config.items)
              ? config.items
              : [{ name: "Automation Service", quantity: 1, price: 10000 }];
            const owner = await ensureOwnerContact();
            const customer = await createOrGetCustomer({
              userId: flow.userId,
              name: String(config.customerName || owner?.name || "Unknown Customer"),
              email: String(config.customerEmail || context.extracted?.email || owner?.email || `unknown+${flow.userId}@placeholder.local`),
            });
            const invoice = await createInvoiceRecord({
              userId: flow.userId,
              customerId: customer.id,
              invoiceNumber,
              currency: config.currency || "USD",
              items,
              status: "SENT",
              discount: config.discount ?? 0,
            });
            context.invoice = invoice;
            pushLog({ stepIndex, step: stepType, result: { invoiceNumber: invoice.invoiceNumber } });
            break;
          }
          case "sendEmail": {
            const actionId = readActionId(config);
            const invoiceContext = await ensureAutomationInvoiceContext(context);
            const business = await ensureBusinessProfile();
            const owner = await ensureOwnerContact();
            if (
              actionId === "send_receipt" &&
              invoiceContext?.customer &&
              business
            ) {
              await sendInvoiceEmailToCustomer(
                invoiceContext.invoice,
                business,
                invoiceContext.customer
              );
              pushLog({
                stepIndex,
                step: stepType,
                result: { to: invoiceContext.customer.email, mode: "invoice-receipt" },
              });
              break;
            }
            const to = pickFirstString(
              config.to,
              actionId === "notify_team_payment" || actionId === "notify_team" ? business?.businessEmail : "",
              actionId === "notify_team_payment" || actionId === "notify_team" ? owner?.email : "",
              context.extracted?.email,
              context.input?.customer?.email,
              context.input?.invoice?.customerEmail,
              invoiceContext?.customer?.email
            );
            if (!to) {
              pushLog({ stepIndex, step: stepType, skipped: true, reason: "Missing recipient email" });
              break;
            }
            const emailDraft = buildAutomationEmailDraft({
              actionId,
              note: String(config.note || ""),
              flowTitle: flow.title,
              invoiceContext,
            });
            await trackRateLimitedAction({
              userId: flow.userId,
              action: "AUTOMATION_EMAIL_DISPATCH",
              limitPerMinute: PROVIDER_DISPATCH_PER_MINUTE_LIMIT,
              message: "Email dispatch rate limit exceeded. Retrying shortly.",
            });
            await sendNotificationsMail({
              to,
              subject: config.subject || emailDraft.subject,
              html: config.html || emailDraft.html,
            });
            await logUserActivity({
              tenantId: usageScope.businessId ?? null,
              userId: flow.userId,
              actorId: flow.userId,
              eventType: "notification_sent",
              metadata: {
                channel: "email",
                to,
                flowId: flow.id,
                runId,
              },
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
            const prompt = config.prompt || buildAutomationAiPrompt(readActionId(config), String(config.note || "")) || "Summarize data";
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
              idempotencyKey: runId ? `auto_ai:${runId}:${stepIndex}` : undefined,
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
            const actionId = readActionId(config);
            const invoiceContext = await ensureAutomationInvoiceContext(context);
            const to = pickFirstString(
              config.to,
              context.input?.customer?.phone,
              context.input?.invoice?.customerPhone,
              invoiceContext?.customer?.phone
            );
            const text =
              pickFirstString(config.text) ||
              buildAutomationWhatsAppText({
                actionId,
                note: String(config.note || ""),
                invoiceContext,
              });
            if (!to || !text) {
              pushLog({ stepIndex, step: stepType, skipped: true, reason: "Missing WhatsApp message details" });
              break;
            }
            if (!businessProfile) {
              businessProfile = await ensureBusinessProfile();
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
              to,
              text,
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
        if (runId) {
          await markStepFinished({
            runId,
            stepIndex,
            status: "SUCCESS",
            startedAt: stepStartedAt,
            safeOutput: {
              step: stepType,
              completed: true,
            },
          });
        }
      } catch (stepError: any) {
        const normalizedError =
          stepError instanceof Error ? stepError : new Error(typeof stepError === "string" ? stepError : "Step failed");
        if (runId) {
          await markStepFinished({
            runId,
            stepIndex,
            status: "FAILED",
            startedAt: stepStartedAt,
            errorMessage: normalizedError.message,
            errorCode: extractHttpStatus(normalizedError)?.toString() || null,
          });
        }
        const transient = isTransientStepError(normalizedError);
        if (transient) {
          const retryDecision = await scheduleTransientRetry({
            stepIndex,
            stepType,
            stepId,
            error: normalizedError,
          });
          if (retryDecision.scheduled) {
            break;
          }
          lastFailedStep = {
            stepId,
            stepIndex,
            stepType,
            transient,
            attempts: retryDecision.attempts,
            error: normalizedError,
          };
        } else {
          lastFailedStep = {
            stepId,
            stepIndex,
            stepType,
            transient,
            attempts: 1,
            error: normalizedError,
          };
        }
        pushLog({
          stepIndex,
          step: stepType,
          stepId,
          result: "failed",
          transient,
          error: normalizedError.message,
        });
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
    const failedStep: FailedStepRecord | null = lastFailedStep;
    const recoveryStatus = deriveRecoveryStatus({ status, originalRunId: runOriginalRunId });
    const operations: Prisma.PrismaPromise<any>[] = [
      prisma.automationRun.update({
        where: { id: runId },
        data: {
          runStatus: status,
          recoveryStatus,
          logs: asJsonArray(logs),
          output: asJsonObject(runMeta),
          completedAt: shouldFinalizeRun ? runCompletedAt : null,
        },
      }),
      prisma.activityLog.create({
        data: {
          userId: flow.userId,
          action: `AUTOMATION_RUN_${status}`,
          metadata: {
            flowId: flow.id,
            logsCount: logs.length,
            runId,
            recoveryStatus,
          },
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
    if (status === "FAILED" && failedStep !== null) {
      const failedStepData = failedStep as FailedStepRecord;
      operations.push(
        prisma.automationRunError.create({
          data: {
            runId,
            flowId: flow.id,
            userId: flow.userId,
            stepId: failedStepData.stepId,
            stepIndex: failedStepData.stepIndex,
            errorType: failedStepData.stepType,
            message: failedStepData.error.message.slice(0, 2000),
            stackTrace: failedStepData.error.stack?.slice(0, 10_000) || null,
            transient: failedStepData.transient,
          },
        })
      );
      operations.push(
        prisma.activityLog.create({
          data: {
            userId: flow.userId,
            action: "AUTOMATION_FAILURE_RECORDED",
            metadata: {
              runId,
              flowId: flow.id,
              stepId: failedStepData.stepId,
              stepType: failedStepData.stepType,
              stepIndex: failedStepData.stepIndex,
              transient: failedStepData.transient,
              attempts: failedStepData.attempts,
            },
          },
        })
      );
    }
    if (status === "PENDING") {
      operations.push(
        prisma.activityLog.create({
          data: {
            userId: flow.userId,
            action: "AUTOMATION_RECOVERY_RETRYING",
            metadata: {
              runId,
              flowId: flow.id,
            },
          },
        })
      );
    }
    if (status === "SUCCESS") {
      operations.push(
        prisma.activityLog.create({
          data: {
            userId: flow.userId,
            action: "AUTOMATION_RECOVERED",
            metadata: {
              runId,
              flowId: flow.id,
              originalRunId: runOriginalRunId,
            },
          },
        })
      );
    }
    await prisma.$transaction(operations);
    if (status === "FAILED") {
      const failedStepData = failedStep as FailedStepRecord | null;
      await emitSystemEvent({
        tenantId: usageScope.businessId ?? null,
        userId: flow.userId,
        actorId: flow.userId,
        eventType: "automation_run_failed",
        severity: "WARNING",
        source: "AUTOMATION",
        entityType: "automation_run",
        entityId: runId,
        message: `Automation ${flow.title} failed.`,
        metadata: {
          flowId: flow.id,
          flowTitle: flow.title,
          originalRunId: runOriginalRunId,
          failedStepId: failedStepData?.stepId || null,
          failedStepType: failedStepData?.stepType || null,
        },
      });
      try {
        await createAdminNotificationFromEvent({
          eventType: "AUTOMATION_RUN_FAILED",
          tenantId: usageScope.businessId ?? null,
          entityId: runId,
          payload: {
            runId,
            flowId: flow.id,
            flowTitle: flow.title,
            userId: flow.userId,
            summary: `Automation ${flow.title} failed.`,
          },
          occurredAt: runCompletedAt,
        });
      } catch (error) {
        log("error", "automation_admin_notification_failed", {
          flowId: flow.id,
          runId,
          error,
        });
      }
    }
    if (status === "SUCCESS") {
      await emitSystemEvent({
        tenantId: usageScope.businessId ?? null,
        userId: flow.userId,
        actorId: flow.userId,
        eventType: "automation_run_succeeded",
        severity: "INFO",
        source: "AUTOMATION",
        entityType: "automation_run",
        entityId: runId,
        message: `Automation ${flow.title} succeeded.`,
        metadata: {
          flowId: flow.id,
          flowTitle: flow.title,
          originalRunId: runOriginalRunId,
        },
      });
    }
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
          idempotencyKey: runId ? `auto_run:${runId}` : undefined,
        });
      } catch (error) {
        log("error", "analytics_automation_failed", { flowId: flow.id, error });
      }
    }
  }
}
