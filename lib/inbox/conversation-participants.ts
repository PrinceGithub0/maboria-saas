import "server-only";

import { Prisma } from "@prisma/client";
import { buildInboundConversationUpdate, buildOutboundConversationUpdate } from "@/lib/inbox/conversation-state";
import { prisma } from "@/lib/prisma";

type PrismaLike = Prisma.TransactionClient | typeof prisma;

export async function ensureUnifiedConversationParticipants(
  tx: PrismaLike,
  input: { tenantId: string; conversationId: string }
) {
  const members = await tx.businessMember.findMany({
    where: {
      businessId: input.tenantId,
      status: "active",
    },
    select: { userId: true },
  });

  if (!members.length) return;

  await tx.unifiedConversationParticipant.createMany({
    data: members.map((member) => ({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      userId: member.userId,
    })),
    skipDuplicates: true,
  });
}

export async function markUnifiedConversationSeen(
  tx: PrismaLike,
  input: {
    tenantId: string;
    conversationId: string;
    userId: string;
    seenAt?: Date;
    lastMessageAt?: Date | null;
  }
) {
  const seenAt = input.seenAt ?? new Date();
  const lastSeenMessageAt = input.lastMessageAt ?? seenAt;

  await tx.unifiedConversationParticipant.upsert({
    where: {
      conversationId_userId: {
        conversationId: input.conversationId,
        userId: input.userId,
      },
    },
    update: {
      unreadCount: 0,
      lastSeenAt: seenAt,
      lastSeenMessageAt,
    },
    create: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      userId: input.userId,
      unreadCount: 0,
      lastSeenAt: seenAt,
      lastSeenMessageAt,
    },
  });
}

export async function applyUnifiedInboundActivity(
  tx: PrismaLike,
  input: {
    tenantId: string;
    conversationId: string;
    occurredAt: Date;
  }
) {
  await ensureUnifiedConversationParticipants(tx, input);
  await tx.unifiedConversation.update({
    where: { id: input.conversationId },
    data: buildInboundConversationUpdate(input.occurredAt),
  });
  await tx.unifiedConversationParticipant.updateMany({
    where: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
    },
    data: {
      unreadCount: { increment: 1 },
    },
  });
}

export async function applyUnifiedOutboundActivity(
  tx: PrismaLike,
  input: {
    tenantId: string;
    conversationId: string;
    actorUserId: string;
    occurredAt: Date;
  }
) {
  await ensureUnifiedConversationParticipants(tx, input);
  await tx.unifiedConversation.update({
    where: { id: input.conversationId },
    data: buildOutboundConversationUpdate(input.occurredAt),
  });
  await markUnifiedConversationSeen(tx, {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    userId: input.actorUserId,
    seenAt: input.occurredAt,
    lastMessageAt: input.occurredAt,
  });
}

export async function expireUnifiedConversationSnoozes(
  tx: PrismaLike,
  input: { tenantId: string; now?: Date }
) {
  const now = input.now ?? new Date();
  await tx.unifiedConversation.updateMany({
    where: {
      tenantId: input.tenantId,
      status: "SNOOZED",
      snoozedUntil: {
        lte: now,
      },
    },
    data: {
      status: "OPEN",
      snoozedUntil: null,
    },
  });
}
