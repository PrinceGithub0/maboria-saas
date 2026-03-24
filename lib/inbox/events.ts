import "server-only";

import { Prisma } from "@prisma/client";
import { enqueueJob } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { emitSystemEvent } from "@/lib/system-events";

export type UnifiedEventType =
  | "message.received"
  | "message.sent"
  | "conversation.assigned"
  | "conversation.resolved"
  | "conversation.reopened"
  | "conversation.snoozed";

export async function emitUnifiedInboxEvent(input: {
  tenantId: string;
  type: UnifiedEventType;
  conversationId: string;
  actorUserId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.unifiedAuditEvent.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId ?? null,
      actionType: input.type,
      conversationId: input.conversationId,
      metadata: input.metadata ?? undefined,
    },
  });

  enqueueJob("unified-inbox-event", {
    tenantId: input.tenantId,
    type: input.type,
    conversationId: input.conversationId,
    actorUserId: input.actorUserId ?? null,
    metadata: input.metadata ?? null,
  });

  if (input.type === "message.received" || input.type === "message.sent") {
    await emitSystemEvent({
      tenantId: input.tenantId,
      actorId: input.actorUserId ?? null,
      eventType: input.type === "message.received" ? "message_received" : "message_sent",
      severity: "INFO",
      source: "INBOX",
      entityType: "conversation",
      entityId: input.conversationId,
      message: input.type === "message.received" ? "Inbox message received." : "Inbox message sent.",
      metadata:
        input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
          ? (input.metadata as Record<string, unknown>)
          : {},
    });
  }
}
