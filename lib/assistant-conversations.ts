import { prisma } from "./prisma";

type AsyncResult<T = unknown> = Promise<T>;
type DelegateFn<T = unknown> = (...args: unknown[]) => AsyncResult<T>;
type DelegateListFn<T = unknown> = (...args: unknown[]) => AsyncResult<T[]>;
type LegacyEntry = { createdAt: Date; role: string; content: string };
type ConversationRecord = {
  id: string;
  title?: string | null;
  lastMessageAt?: Date | null;
  updatedAt?: Date | null;
  createdAt?: Date | null;
};

const prismaAny = prisma as unknown as {
  aiConversation?: {
    findMany: DelegateListFn;
    findFirst: DelegateFn;
    create: DelegateFn;
    update: DelegateFn;
    deleteMany: DelegateFn;
  };
  aiMessage?: {
    findMany: DelegateListFn;
    createMany: DelegateFn;
    create: DelegateFn;
  };
  aiMemory?: {
    findMany: DelegateListFn;
    create: DelegateFn;
    deleteMany: DelegateFn;
  };
};

const hasAiSchema =
  typeof prismaAny.aiConversation?.findFirst === "function" &&
  typeof prismaAny.aiConversation?.create === "function" &&
  typeof prismaAny.aiMessage?.findMany === "function";
const LEGACY_CONVERSATION_ID = "legacy";
const LEGACY_TITLE = "General";

const DEFAULT_TITLE = "New chat";

const toTitle = (value: string) => {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 64 ? `${trimmed.slice(0, 61)}...` : trimmed;
};

const isLegacyConversation = (conversationId?: string | null) =>
  conversationId === LEGACY_CONVERSATION_ID;

export async function listAiConversations(userId: string) {
  if (!hasAiSchema) {
    const legacy = (await prismaAny.aiMemory?.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    })) as LegacyEntry[] | undefined;
    if (!legacy || legacy.length === 0) return [];
    const lastMessageAt = legacy[legacy.length - 1]?.createdAt;
    return [
      {
        id: LEGACY_CONVERSATION_ID,
        title: LEGACY_TITLE,
        lastMessageAt,
        updatedAt: lastMessageAt,
        createdAt: legacy[0]?.createdAt,
      },
    ];
  }
  return prismaAny.aiConversation!.findMany({
    where: { userId },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      lastMessageAt: true,
      updatedAt: true,
      createdAt: true,
    },
  });
}

export async function ensureDefaultAiConversation(userId: string) {
  if (!hasAiSchema) {
    return {
      id: LEGACY_CONVERSATION_ID,
      title: LEGACY_TITLE,
      lastMessageAt: null,
      updatedAt: null,
      createdAt: null,
    };
  }
  const existing = (await prismaAny.aiConversation!.findFirst({
    where: { userId },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
  })) as ConversationRecord | null;
  if (existing) return existing;

  const legacy = (await prismaAny.aiMemory?.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  })) as LegacyEntry[] | undefined;
  if (legacy && legacy.length > 0) {
    const lastMessageAt = legacy[legacy.length - 1].createdAt;
    const conversation = (await prismaAny.aiConversation!.create({
      data: {
        userId,
        title: "General",
        lastMessageAt,
      },
    })) as ConversationRecord;
    await prismaAny.aiMessage?.createMany({
      data: legacy.map((entry) => ({
        conversationId: conversation.id,
        userId,
        role: entry.role,
        content: entry.content,
        createdAt: entry.createdAt,
      })),
    });
    return conversation;
  }

  return (await prismaAny.aiConversation!.create({
    data: {
      userId,
      title: DEFAULT_TITLE,
    },
  })) as ConversationRecord;
}

export async function createAiConversation(userId: string, title?: string) {
  if (!hasAiSchema) {
    return {
      id: LEGACY_CONVERSATION_ID,
      title: title && title.trim().length > 0 ? toTitle(title) : LEGACY_TITLE,
      lastMessageAt: null,
      updatedAt: null,
      createdAt: null,
    };
  }
  return (await prismaAny.aiConversation!.create({
    data: {
      userId,
      title: title && title.trim().length > 0 ? toTitle(title) : DEFAULT_TITLE,
    },
  })) as ConversationRecord;
}

export async function renameAiConversation(userId: string, conversationId: string, title: string) {
  const normalizedTitle = toTitle(title);
  if (isLegacyConversation(conversationId) || !hasAiSchema) {
    return {
      id: LEGACY_CONVERSATION_ID,
      title: normalizedTitle,
      lastMessageAt: null,
      updatedAt: null,
      createdAt: null,
    };
  }
  const existing = (await prismaAny.aiConversation!.findFirst({
    where: { id: conversationId, userId },
  })) as ConversationRecord | null;
  if (!existing) {
    return {
      id: LEGACY_CONVERSATION_ID,
      title: normalizedTitle,
      lastMessageAt: null,
      updatedAt: null,
      createdAt: null,
    };
  }
  return (await prismaAny.aiConversation!.update({
    where: { id: conversationId, userId },
    data: { title: normalizedTitle },
  })) as ConversationRecord;
}

export async function deleteAiConversation(userId: string, conversationId: string) {
  if (isLegacyConversation(conversationId) || !hasAiSchema) {
    await prismaAny.aiMemory?.deleteMany({ where: { userId } });
    return;
  }
  await prismaAny.aiConversation?.deleteMany({
    where: { id: conversationId, userId },
  });
}

export async function getAiConversationMessages(
  userId: string,
  conversationId: string,
  limit = 100
) {
  if (isLegacyConversation(conversationId) || !hasAiSchema) {
    const messages = (await prismaAny.aiMemory?.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: limit,
    })) as LegacyEntry[] | undefined;
    return {
      conversation: {
        id: LEGACY_CONVERSATION_ID,
        title: LEGACY_TITLE,
        lastMessageAt: null,
        updatedAt: null,
        createdAt: null,
      },
      messages: messages ?? [],
    };
  }
  const conversation = (await prismaAny.aiConversation!.findFirst({
    where: { id: conversationId, userId },
  })) as ConversationRecord | null;
  if (!conversation) {
    const messages = (await prismaAny.aiMemory?.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: limit,
    })) as LegacyEntry[] | undefined;
    if (!messages || messages.length === 0) return null;
    return {
      conversation: {
        id: LEGACY_CONVERSATION_ID,
        title: LEGACY_TITLE,
        lastMessageAt: null,
        updatedAt: null,
        createdAt: null,
      },
      messages,
    };
  }
  const messages = await prismaAny.aiMessage!.findMany({
    where: { conversationId, userId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return { conversation, messages };
}

export async function addAiMessage(params: {
  userId: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
}) {
  const { userId, conversationId, role, content } = params;
  if (isLegacyConversation(conversationId) || !hasAiSchema) {
    return prismaAny.aiMemory?.create({
      data: { userId, role, content },
    });
  }
  const existing = await prismaAny.aiConversation!.findFirst({
    where: { id: conversationId, userId },
  });
  if (!existing) {
    return prismaAny.aiMemory?.create({
      data: { userId, role, content },
    });
  }
  return prisma.$transaction(async (tx: any) => {
    const conversation = (await tx.aiConversation.findFirst({
      where: { id: conversationId, userId },
    })) as ConversationRecord | null;
    if (!conversation) return null;

    const message = await tx.aiMessage.create({
      data: { userId, conversationId, role, content },
    });

    const nextTitle =
      role === "user" && conversation.title === DEFAULT_TITLE ? toTitle(content) : conversation.title;

    await tx.aiConversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: message.createdAt,
        title: nextTitle,
      },
    });

    return message;
  });
}

export async function fetchConversationWindow(
  userId: string,
  conversationId: string,
  limit = 8
) {
  if (isLegacyConversation(conversationId) || !hasAiSchema) {
    return (prismaAny.aiMemory?.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }) as LegacyEntry[] | undefined);
  }
  return prismaAny.aiMessage!.findMany({
    where: { conversationId, userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
