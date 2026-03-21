import "server-only";

import {
  ConnectedMailboxProvider,
  ConnectedMailboxStatus,
  CustomerMailboxChannelType,
  CustomerMailboxConversationStatus,
  CustomerMailboxSenderType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function listConnectedMailboxes(input: {
  workspaceId: string;
  subscriberId?: string | null;
  status?: ConnectedMailboxStatus | null;
  tx?: DbClient;
}) {
  const db = input.tx ?? prisma;
  return db.connectedMailbox.findMany({
    where: {
      workspaceId: input.workspaceId,
      ...(input.subscriberId ? { subscriberId: input.subscriberId } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function createConnectedMailboxRecord(input: {
  subscriberId: string;
  workspaceId: string;
  provider: ConnectedMailboxProvider;
  emailAddress: string;
  displayName?: string | null;
  providerAccountId?: string | null;
  credentialsEncrypted?: string | null;
  accessTokenEncrypted?: string | null;
  refreshTokenEncrypted?: string | null;
  metadata?: Prisma.InputJsonValue;
  status?: ConnectedMailboxStatus;
  tx?: DbClient;
}) {
  const db = input.tx ?? prisma;
  return db.connectedMailbox.create({
    data: {
      subscriberId: input.subscriberId,
      workspaceId: input.workspaceId,
      provider: input.provider,
      emailAddress: input.emailAddress.trim().toLowerCase(),
      displayName: input.displayName?.trim() || null,
      providerAccountId: input.providerAccountId?.trim() || null,
      credentialsEncrypted: input.credentialsEncrypted ?? null,
      accessTokenEncrypted: input.accessTokenEncrypted ?? null,
      refreshTokenEncrypted: input.refreshTokenEncrypted ?? null,
      metadata: input.metadata,
      status: input.status ?? "PENDING",
    },
  });
}

export async function updateConnectedMailboxStatus(input: {
  mailboxId: string;
  workspaceId: string;
  subscriberId?: string | null;
  status: ConnectedMailboxStatus;
  metadata?: Prisma.InputJsonValue;
  tx?: DbClient;
}) {
  const db = input.tx ?? prisma;
  return db.connectedMailbox.updateMany({
    where: {
      id: input.mailboxId,
      workspaceId: input.workspaceId,
      ...(input.subscriberId ? { subscriberId: input.subscriberId } : {}),
    },
    data: {
      status: input.status,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
}

export async function createCustomerMailboxConversation(input: {
  subscriberId: string;
  workspaceId: string;
  customerEmail: string;
  subject: string;
  channelType?: CustomerMailboxChannelType;
  status?: CustomerMailboxConversationStatus;
  connectedMailboxId?: string | null;
  customerId?: string | null;
  externalThreadId?: string | null;
  tx?: DbClient;
}) {
  const db = input.tx ?? prisma;
  return db.customerMailboxConversation.create({
    data: {
      subscriberId: input.subscriberId,
      workspaceId: input.workspaceId,
      customerEmail: input.customerEmail.trim().toLowerCase(),
      subject: input.subject,
      channelType: input.channelType ?? "EMAIL",
      status: input.status ?? "OPEN",
      connectedMailboxId: input.connectedMailboxId ?? null,
      customerId: input.customerId ?? null,
      externalThreadId: input.externalThreadId ?? null,
      lastMessageAt: new Date(),
    },
  });
}

export async function appendCustomerMailboxMessage(input: {
  conversationId: string;
  workspaceId: string;
  subscriberId?: string | null;
  connectedMailboxId?: string | null;
  senderType: CustomerMailboxSenderType;
  senderEmail?: string | null;
  channel?: CustomerMailboxChannelType;
  subject?: string | null;
  textBody: string;
  htmlBody?: string | null;
  attachments?: Prisma.InputJsonValue;
  externalMessageId?: string | null;
  tx?: DbClient;
}) {
  const run = async (tx: DbClient) => {
    const message = await tx.customerMailboxMessage.create({
      data: {
        conversationId: input.conversationId,
        workspaceId: input.workspaceId,
        subscriberId: input.subscriberId ?? null,
        connectedMailboxId: input.connectedMailboxId ?? null,
        senderType: input.senderType,
        senderEmail: input.senderEmail?.trim().toLowerCase() || null,
        channel: input.channel ?? "EMAIL",
        subject: input.subject ?? null,
        textBody: input.textBody,
        htmlBody: input.htmlBody ?? null,
        attachments: input.attachments,
        externalMessageId: input.externalMessageId?.trim() || null,
      },
    });

    await tx.customerMailboxConversation.update({
      where: { id: input.conversationId },
      data: {
        status: input.senderType === "CUSTOMER" ? "OPEN" : undefined,
        lastMessageAt: message.createdAt,
      },
    });

    return message;
  };

  if (input.tx) {
    return run(input.tx);
  }

  return prisma.$transaction(async (tx) => run(tx));
}
