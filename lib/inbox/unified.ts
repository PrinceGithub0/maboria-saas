import "server-only";

import { Prisma, UnifiedInboxType, UnifiedMessageChannel } from "@prisma/client";
import {
  isUnifiedConversationStatus,
  UNIFIED_CONVERSATION_STATUS_VALUES,
} from "@/lib/inbox/conversation-state";
import { prisma } from "@/lib/prisma";
import { requireOrgPermission } from "@/lib/org-auth";

export { isUnifiedConversationStatus, UNIFIED_CONVERSATION_STATUS_VALUES };

export const UNIFIED_INBOX_TYPE_VALUES: UnifiedInboxType[] = ["EMAIL", "WHATSAPP"];
export const UNIFIED_CHANNEL_VALUES: UnifiedMessageChannel[] = ["EMAIL", "WHATSAPP"];

export function isUnifiedInboxType(value: string): value is UnifiedInboxType {
  return UNIFIED_INBOX_TYPE_VALUES.includes(value as UnifiedInboxType);
}

export function isUnifiedMessageChannel(value: string): value is UnifiedMessageChannel {
  return UNIFIED_CHANNEL_VALUES.includes(value as UnifiedMessageChannel);
}

export async function requireUnifiedInboxAccess(userId: string) {
  const access = await requireOrgPermission(userId, {
    permission: "team:read",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    const error = new Error(access.message) as Error & { status?: number; code?: string };
    error.status = access.status;
    error.code = access.code;
    throw error;
  }
  return access.context;
}

export function canViewUnifiedInboxBillingInsights(input: {
  billingAccessOk: boolean;
  billingBusinessId?: string | null;
  orgId?: string | null;
}) {
  if (!input.billingAccessOk) return false;
  return (
    String(input.billingBusinessId || "").trim().length > 0 &&
    String(input.billingBusinessId || "").trim() === String(input.orgId || "").trim()
  );
}

export async function ensureDefaultUnifiedInboxes(tenantId: string) {
  const [email, whatsapp] = await prisma.$transaction(async (tx) => {
    let whatsappInbox = await tx.unifiedInbox.findFirst({
      where: {
        tenantId,
        type: "WHATSAPP",
      },
      orderBy: { createdAt: "asc" },
    });
    if (!whatsappInbox) {
      whatsappInbox = await tx.unifiedInbox.create({
        data: {
          tenantId,
          type: "WHATSAPP",
          name: "WhatsApp Inbox",
          status: "DISCONNECTED",
        },
      });
    }

    const emailInbox = await tx.unifiedInbox.findFirst({
      where: {
        tenantId,
        type: "EMAIL",
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });

    return [emailInbox, whatsappInbox];
  });
  return { email, whatsapp };
}

export async function writeUnifiedAuditEvent(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    actionType: string;
    conversationId?: string | null;
    messageId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
) {
  await tx.unifiedAuditEvent.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId ?? null,
      actionType: input.actionType,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}

export async function incrementUnifiedUsageCounter(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    channel: UnifiedMessageChannel;
    occurredAt?: Date;
  }
) {
  const period = billingPeriodKey(input.occurredAt ?? new Date());
  const data =
    input.channel === "EMAIL"
      ? { emailMessagesSent: { increment: 1 }, totalMessagesSent: { increment: 1 } }
      : { whatsappMessagesSent: { increment: 1 }, totalMessagesSent: { increment: 1 } };

  await tx.unifiedUsageCounter.upsert({
    where: {
      tenantId_billingPeriod: {
        tenantId: input.tenantId,
        billingPeriod: period,
      },
    },
    update: data,
    create: {
      tenantId: input.tenantId,
      billingPeriod: period,
      emailMessagesSent: input.channel === "EMAIL" ? 1 : 0,
      whatsappMessagesSent: input.channel === "WHATSAPP" ? 1 : 0,
      totalMessagesSent: 1,
    },
  });
}

export function billingPeriodKey(value: Date) {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}
