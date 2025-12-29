import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

type WebhookEventResult = {
  id: string;
  duplicate: boolean;
};

export function hashWebhookPayload(rawBody: string) {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

export async function beginWebhookEvent(params: {
  provider: string;
  eventId: string;
  payloadHash: string;
}): Promise<WebhookEventResult> {
  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: params.provider, eventId: params.eventId } },
  });

  if (existing?.status === "PROCESSED") {
    log("info", "webhook_duplicate", { provider: params.provider, eventId: params.eventId });
    return { id: existing.id, duplicate: true };
  }

  if (existing) {
    await prisma.webhookEvent.update({
      where: { id: existing.id },
      data: { payloadHash: params.payloadHash, status: "RECEIVED" },
    });
    return { id: existing.id, duplicate: false };
  }

  const created = await prisma.webhookEvent.create({
    data: {
      provider: params.provider,
      eventId: params.eventId,
      payloadHash: params.payloadHash,
      status: "RECEIVED",
    },
  });
  return { id: created.id, duplicate: false };
}

export async function markWebhookProcessed(eventId: string) {
  const updated = await prisma.webhookEvent.update({
    where: { id: eventId },
    data: { status: "PROCESSED", processedAt: new Date() },
    select: { provider: true, eventId: true },
  });
  await prisma.activityLog.create({
    data: {
      action: "WEBHOOK_PROCESSED",
      resourceType: "webhook",
      resourceId: updated.eventId,
      metadata: { provider: updated.provider },
    },
  });
}

export async function markWebhookFailed(eventId: string, error: string) {
  const updated = await prisma.webhookEvent.update({
    where: { id: eventId },
    data: { status: "FAILED", processedAt: new Date(), error },
    select: { provider: true, eventId: true },
  });
  await prisma.activityLog.create({
    data: {
      action: "WEBHOOK_FAILED",
      resourceType: "webhook",
      resourceId: updated.eventId,
      metadata: { provider: updated.provider, error },
    },
  });
}
