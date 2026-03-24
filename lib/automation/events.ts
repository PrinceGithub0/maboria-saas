import { prisma } from "../prisma";
import { log } from "../logger";
import {
  enforceEntitlement,
  enforceUsageLimit,
  getUserPlan,
  isPlanAtLeast,
  requiredPlanForSteps,
} from "../entitlements";
import { buildVerifiedAutomationEvent } from "./verified-events";
import { shouldProcessEventForFlow } from "./ordering";
import { notifyAutomationLimitReached } from "./limit-notify";

const normalizeStatus = (value: unknown) => String(value || "").trim().toUpperCase();

const matchesInvoiceStatus = (config: any, statuses: Set<string>) => {
  const single = normalizeStatus(config?.status);
  if (single && statuses.has(single)) return true;
  const list = Array.isArray(config?.statuses) ? config.statuses : [];
  return list.some((entry: any) => statuses.has(normalizeStatus(entry)));
};

const normalizeEventTimestamp = (value?: string | Date) => {
  if (!value) return new Date().toISOString();
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const happenedBeforeFlowActivation = (occurredAtIso: string, flowCreatedAt: Date) =>
  new Date(occurredAtIso).getTime() < flowCreatedAt.getTime();

const invoiceStatusMatchesCurrent = (eventStatus: string, currentStatus: string) => {
  if (eventStatus === currentStatus) return true;
  if (eventStatus === "UNPAID" && (currentStatus === "SENT" || currentStatus === "OVERDUE")) return true;
  if (currentStatus === "UNPAID" && (eventStatus === "SENT" || eventStatus === "OVERDUE")) return true;
  return false;
};

export async function triggerInvoiceStatusAutomations({
  userId,
  invoiceId,
  invoiceNumber,
  status,
  provider,
  reference,
  eventId,
  occurredAt,
  source,
}: {
  userId: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  provider?: "PAYSTACK" | "FLUTTERWAVE";
  reference?: string;
  eventId?: string;
  occurredAt?: string | Date;
  source?: string;
}) {
  const normalized = normalizeStatus(status);
  if (!normalized) return { triggered: 0 };
  const statusSet = new Set([normalized]);
  if (normalized === "SENT" || normalized === "OVERDUE") {
    statusSet.add("UNPAID");
  }
  if (normalized === "UNPAID") {
    statusSet.add("SENT");
    statusSet.add("OVERDUE");
  }
  const eventTimestamp = normalizeEventTimestamp(occurredAt);
  const currentInvoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    select: { status: true },
  });
  if (!currentInvoice) {
    log("warn", "invoice_status_trigger_skipped", {
      reason: "invoice_not_found",
      userId,
      invoiceId,
      invoiceNumber,
      status: normalized,
    });
    return { triggered: 0 };
  }

  const currentStatus = normalizeStatus(currentInvoice.status);
  if (!invoiceStatusMatchesCurrent(normalized, currentStatus)) {
    log("info", "invoice_status_trigger_skipped", {
      reason: "stale_event_state_mismatch",
      userId,
      invoiceId,
      invoiceNumber,
      eventStatus: normalized,
      currentStatus,
      eventTimestamp,
    });
    return { triggered: 0 };
  }

  const triggers = await prisma.trigger.findMany({
    where: { type: "invoice_status", flow: { userId, status: "ACTIVE" } },
    include: { flow: true },
  });

  const matched = triggers.filter((trigger) => matchesInvoiceStatus(trigger.config, statusSet));
  if (!matched.length) return { triggered: 0 };

  let triggered = 0;
  try {
    const { executeAutomationRun } = await import("./engine");
    const plan = await getUserPlan(userId);
    const verifiedEvent = buildVerifiedAutomationEvent({
      type: provider && reference ? "payment.verified" : "invoice.status.changed",
      userId,
      source: source || "system:invoice-status",
      occurredAt,
      eventId:
        eventId ||
        (provider && reference
          ? `${provider}:${reference}:${normalized}`
          : `invoice:${invoiceId}:${normalized}:${eventTimestamp}`),
      invoice: { id: invoiceId, invoiceNumber, status: normalized },
      payment: provider && reference ? { provider, reference } : undefined,
      metadata: {
        statusSet: Array.from(statusSet.values()),
        orderingKey: `invoice:${invoiceId}`,
      },
    });

    for (const trigger of matched) {
      try {
        if (happenedBeforeFlowActivation(eventTimestamp, trigger.flow.createdAt)) {
          log("info", "invoice_status_trigger_skipped", {
            reason: "event_before_activation",
            userId,
            flowId: trigger.flowId,
            invoiceId,
            invoiceNumber,
            status: normalized,
            eventTimestamp,
            flowCreatedAt: trigger.flow.createdAt.toISOString(),
          });
          continue;
        }

        const orderingDecision = await shouldProcessEventForFlow({
          flowId: trigger.flowId,
          eventType: verifiedEvent.type,
          source: verifiedEvent.source,
          orderingKey: String((verifiedEvent.metadata as Record<string, unknown> | undefined)?.orderingKey || ""),
          occurredAt: verifiedEvent.occurredAt,
          eventId: verifiedEvent.eventId,
        });
        if (!orderingDecision.accept) {
          log("info", "invoice_status_trigger_skipped", {
            reason: orderingDecision.reason || "stale_event",
            userId,
            flowId: trigger.flowId,
            invoiceId,
            invoiceNumber,
            status: normalized,
            eventId: verifiedEvent.eventId,
            occurredAt: verifiedEvent.occurredAt,
            latestOccurredAt: orderingDecision.latestOccurredAt,
            latestEventId: orderingDecision.latestEventId,
          });
          continue;
        }

        const entitlement = await enforceEntitlement(userId, {
          feature: "automations",
          requiredPlan: "starter",
          allowTrial: false,
        });
        if (!entitlement.ok) {
          log("info", "invoice_status_trigger_blocked", {
            userId,
            flowId: trigger.flowId,
            reason: entitlement.reason,
            type: entitlement.type,
          });
          continue;
        }

        const required = requiredPlanForSteps((trigger.flow.steps as any[]) || []);
        if (required && !isPlanAtLeast(plan, required.plan)) {
          log("info", "invoice_status_trigger_blocked", {
            userId,
            flowId: trigger.flowId,
            reason: required.reason,
            requiredPlan: required.plan,
          });
          continue;
        }

        const usage = await enforceUsageLimit(userId, "automationRuns");
        if (!usage.ok) {
          await notifyAutomationLimitReached({
            userId,
            source: "invoice_status_trigger",
            flowId: trigger.flowId,
            plan: usage.plan ?? null,
            limit: usage.limit ?? null,
            used: usage.used ?? null,
            code: usage.code ?? null,
          }).catch(() => null);
          log("info", "invoice_status_trigger_blocked", {
            userId,
            flowId: trigger.flowId,
            reason: "Automation run limit reached",
            plan: usage.plan,
            limit: usage.limit,
            used: usage.used,
          });
          continue;
        }

        const result = await executeAutomationRun(
          trigger.flow as any,
          {
            event: "invoice_status",
            invoice: { id: invoiceId, invoiceNumber, status: normalized },
            payment: provider && reference ? { provider, reference } : undefined,
            eventId: verifiedEvent.eventId,
          },
          {
            trigger: "Invoice status",
            source: "System",
            event: verifiedEvent,
            idempotencyKey: verifiedEvent.idempotencyKey,
          }
        );
        if ((result as any)?.skipped) {
          log("info", "invoice_status_trigger_skipped", {
            reason: (result as any)?.reason || "engine_skipped",
            userId,
            flowId: trigger.flowId,
            invoiceId,
            invoiceNumber,
            status: normalized,
            eventId: verifiedEvent.eventId,
          });
          continue;
        }
        triggered += 1;
      } catch (error) {
        log("error", "invoice_status_trigger_failed", {
          invoiceId,
          flowId: trigger.flowId,
          error,
        });
      }
    }
  } catch (error) {
    log("error", "invoice_status_trigger_loader_failed", { invoiceId, error });
  }

  log("info", "invoice_status_triggered", {
    userId,
    invoiceId,
    invoiceNumber,
    status: normalized,
    triggered,
  });
  return { triggered };
}

export async function triggerInvoiceCreatedAutomations({
  userId,
  invoiceId,
  invoiceNumber,
  status,
  eventId,
  occurredAt,
  source,
}: {
  userId: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  eventId?: string;
  occurredAt?: string | Date;
  source?: string;
}) {
  const eventTimestamp = normalizeEventTimestamp(occurredAt);
  const triggers = await prisma.trigger.findMany({
    where: { type: "invoice_created", flow: { userId, status: "ACTIVE" } },
    include: { flow: true },
  });
  if (!triggers.length) return { triggered: 0 };

  let triggered = 0;
  try {
    const { executeAutomationRun } = await import("./engine");
    const plan = await getUserPlan(userId);
    const verifiedEvent = buildVerifiedAutomationEvent({
      type: "invoice.created",
      userId,
      source: source || "system:invoice-created",
      occurredAt,
      eventId: eventId || `invoice:${invoiceId}:created:${eventTimestamp}`,
      invoice: { id: invoiceId, invoiceNumber, status },
      metadata: {
        orderingKey: `invoice:${invoiceId}`,
      },
    });

    for (const trigger of triggers) {
      try {
        if (happenedBeforeFlowActivation(eventTimestamp, trigger.flow.createdAt)) {
          log("info", "invoice_created_trigger_skipped", {
            reason: "event_before_activation",
            userId,
            flowId: trigger.flowId,
            invoiceId,
            invoiceNumber,
            eventTimestamp,
            flowCreatedAt: trigger.flow.createdAt.toISOString(),
          });
          continue;
        }

        const orderingDecision = await shouldProcessEventForFlow({
          flowId: trigger.flowId,
          eventType: verifiedEvent.type,
          source: verifiedEvent.source,
          orderingKey: String((verifiedEvent.metadata as Record<string, unknown> | undefined)?.orderingKey || ""),
          occurredAt: verifiedEvent.occurredAt,
          eventId: verifiedEvent.eventId,
        });
        if (!orderingDecision.accept) {
          log("info", "invoice_created_trigger_skipped", {
            reason: orderingDecision.reason || "stale_event",
            userId,
            flowId: trigger.flowId,
            invoiceId,
            invoiceNumber,
            eventId: verifiedEvent.eventId,
            occurredAt: verifiedEvent.occurredAt,
            latestOccurredAt: orderingDecision.latestOccurredAt,
            latestEventId: orderingDecision.latestEventId,
          });
          continue;
        }

        const entitlement = await enforceEntitlement(userId, {
          feature: "automations",
          requiredPlan: "starter",
          allowTrial: false,
        });
        if (!entitlement.ok) {
          log("info", "invoice_created_trigger_blocked", {
            userId,
            flowId: trigger.flowId,
            reason: entitlement.reason,
            type: entitlement.type,
          });
          continue;
        }

        const required = requiredPlanForSteps((trigger.flow.steps as any[]) || []);
        if (required && !isPlanAtLeast(plan, required.plan)) {
          log("info", "invoice_created_trigger_blocked", {
            userId,
            flowId: trigger.flowId,
            reason: required.reason,
            requiredPlan: required.plan,
          });
          continue;
        }

        const usage = await enforceUsageLimit(userId, "automationRuns");
        if (!usage.ok) {
          await notifyAutomationLimitReached({
            userId,
            source: "invoice_created_trigger",
            flowId: trigger.flowId,
            plan: usage.plan ?? null,
            limit: usage.limit ?? null,
            used: usage.used ?? null,
            code: usage.code ?? null,
          }).catch(() => null);
          log("info", "invoice_created_trigger_blocked", {
            userId,
            flowId: trigger.flowId,
            reason: "Automation run limit reached",
            plan: usage.plan,
            limit: usage.limit,
            used: usage.used,
          });
          continue;
        }

        const result = await executeAutomationRun(
          trigger.flow as any,
          {
            event: "invoice_created",
            invoice: { id: invoiceId, invoiceNumber, status },
            eventId: verifiedEvent.eventId,
          },
          {
            trigger: "Invoice created",
            source: "System",
            event: verifiedEvent,
            idempotencyKey: verifiedEvent.idempotencyKey,
          }
        );
        if ((result as any)?.skipped) {
          log("info", "invoice_created_trigger_skipped", {
            reason: (result as any)?.reason || "engine_skipped",
            userId,
            flowId: trigger.flowId,
            invoiceId,
            invoiceNumber,
            eventId: verifiedEvent.eventId,
          });
          continue;
        }

        triggered += 1;
      } catch (error) {
        log("error", "invoice_created_trigger_failed", {
          invoiceId,
          flowId: trigger.flowId,
          error,
        });
      }
    }
  } catch (error) {
    log("error", "invoice_created_trigger_loader_failed", { invoiceId, error });
  }

  log("info", "invoice_created_triggered", {
    userId,
    invoiceId,
    invoiceNumber,
    triggered,
  });
  return { triggered };
}
