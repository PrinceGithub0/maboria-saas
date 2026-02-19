import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeAutomationRun } from "@/lib/automation/engine";
import { log } from "@/lib/logger";
import {
  enforceEntitlement,
  enforceUsageLimit,
  getUserPlan,
  isPlanAtLeast,
  requiredPlanForSteps,
} from "@/lib/entitlements";
import { buildVerifiedAutomationEvent } from "@/lib/automation/verified-events";
import { shouldProcessEventForFlow } from "@/lib/automation/ordering";
import { notifyAutomationLimitReached } from "@/lib/automation/limit-notify";

const resolveWebhookEventId = (payload: any) =>
  String(
    payload?.eventId ||
      payload?.event_id ||
      payload?.id ||
      payload?.reference ||
      payload?.data?.id ||
      payload?.data?.reference ||
      ""
  ).trim();

const resolveWebhookOrderingKey = (payload: any, path: string) => {
  const candidates = [
    payload?.reference,
    payload?.invoiceId,
    payload?.invoice_id,
    payload?.paymentId,
    payload?.payment_id,
    payload?.customerId,
    payload?.customer_id,
    payload?.data?.reference,
    payload?.data?.invoiceId,
    payload?.data?.invoice_id,
    payload?.data?.paymentId,
    payload?.data?.payment_id,
    payload?.data?.customerId,
    payload?.data?.customer_id,
    payload?.data?.id,
    payload?.id,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (!candidates.length) return null;
  return `${path}:${candidates[0]}`;
};

const happenedBeforeFlowActivation = (occurredAtIso: string, flowCreatedAt: Date) =>
  new Date(occurredAtIso).getTime() < flowCreatedAt.getTime();

export async function POST(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "/";
  const payload = await req.json().catch(() => ({}));

  const triggers = await prisma.trigger.findMany({
    where: { type: "webhook", config: { path: ["path"], equals: path }, flow: { status: "ACTIVE" } },
    include: { flow: true },
  });
  let attempted = 0;
  let triggered = 0;
  let skipped = 0;

  for (const trigger of triggers) {
    attempted += 1;
    const userId = trigger.flow.userId;
    const entitlement = await enforceEntitlement(userId, {
      feature: "automations",
      requiredPlan: "starter",
      allowTrial: false,
    });
    if (!entitlement.ok) {
      log("warn", "automation_run_skipped", {
        reason: entitlement.reason,
        type: entitlement.type,
        flowId: trigger.flow.id,
        userId,
      });
      continue;
    }

    const plan = await getUserPlan(userId);
    const required = requiredPlanForSteps((trigger.flow.steps as any[]) || []);
    if (required && !isPlanAtLeast(plan, required.plan)) {
      log("warn", "automation_run_skipped", {
        reason: required.reason,
        requiredPlan: required.plan,
        flowId: trigger.flow.id,
        userId,
      });
      continue;
    }

    const usage = await enforceUsageLimit(userId, "automationRuns");
    if (!usage.ok) {
      await notifyAutomationLimitReached({
        userId,
        source: "webhook_ingest_trigger",
        flowId: trigger.flow.id,
        plan: usage.plan ?? null,
        limit: usage.limit ?? null,
        used: usage.used ?? null,
        code: usage.code ?? null,
      }).catch(() => null);
      log("warn", "automation_run_skipped", {
        reason: usage.code ?? "limit_reached",
        plan: usage.plan,
        limit: usage.limit,
        used: usage.used,
        flowId: trigger.flow.id,
        userId,
      });
      continue;
    }

    const event = buildVerifiedAutomationEvent({
      type: "webhook.received",
      userId,
      source: `webhook:${path}`,
      eventId: resolveWebhookEventId(payload) || undefined,
      occurredAt: payload?.timestamp || payload?.createdAt || payload?.created_at,
      metadata: {
        path,
        orderingKey: resolveWebhookOrderingKey(payload, path),
      },
    });

    if (happenedBeforeFlowActivation(event.occurredAt, trigger.flow.createdAt)) {
      log("info", "automation_run_skipped", {
        reason: "event_before_activation",
        flowId: trigger.flow.id,
        userId,
        path,
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        flowCreatedAt: trigger.flow.createdAt.toISOString(),
      });
      continue;
    }

    const orderingDecision = await shouldProcessEventForFlow({
      flowId: trigger.flow.id,
      eventType: event.type,
      source: event.source,
      orderingKey: String((event.metadata as Record<string, unknown> | undefined)?.orderingKey || ""),
      occurredAt: event.occurredAt,
      eventId: event.eventId,
    });
    if (!orderingDecision.accept) {
      log("info", "automation_run_skipped", {
        reason: orderingDecision.reason || "stale_event",
        flowId: trigger.flow.id,
        userId,
        path,
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        latestOccurredAt: orderingDecision.latestOccurredAt,
        latestEventId: orderingDecision.latestEventId,
      });
      continue;
    }

    const result = await executeAutomationRun(
      trigger.flow,
      {
        ...payload,
        _verifiedEvent: {
          id: event.eventId,
          type: event.type,
          occurredAt: event.occurredAt,
        },
      },
      {
        trigger: "Webhook",
        source: `Webhook:${path}`,
        event,
        idempotencyKey: event.idempotencyKey,
      }
    );
    if ((result as any)?.skipped) {
      skipped += 1;
      continue;
    }
    triggered += 1;
  }

  return NextResponse.json({ received: true, attempted, triggered, skipped });
}

export const dynamic = "force-dynamic";
