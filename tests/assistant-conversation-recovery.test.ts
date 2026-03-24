import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { addAiMessage, resolveAiConversation } from "@/lib/assistant-conversations";

const prismaAny = prisma as any;

const originalAiConversationFindFirst = prismaAny.aiConversation.findFirst;
const originalAiConversationCreate = prismaAny.aiConversation.create;
const originalAiMessageCreate = prismaAny.aiMessage.create;
const originalAiMemoryFindMany = prismaAny.aiMemory.findMany;
const originalTransaction = prismaAny.$transaction;

const userId = "user_test";
const defaultConversation = {
  id: "conv_default",
  title: "New chat",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastMessageAt: null,
};

(async () => {
  try {
    prismaAny.aiConversation.findFirst = async ({ where }: any) => {
      if (where?.id === "conv_live" && where?.userId === userId) {
        return { ...defaultConversation, id: "conv_live", title: "Existing chat" };
      }
      return null;
    };
    prismaAny.aiConversation.create = async () => defaultConversation;
    prismaAny.aiMessage.create = async ({ data }: any) => ({
      id: "msg_1",
      createdAt: new Date(),
      ...data,
    });
    prismaAny.aiMemory.findMany = async () => [];
    prismaAny.$transaction = async (callback: any) =>
      callback({
        aiConversation: {
          findFirst: prismaAny.aiConversation.findFirst,
          update: async ({ data }: any) => ({ ...defaultConversation, ...data }),
        },
        aiMessage: {
          create: prismaAny.aiMessage.create,
        },
      });

    const recoveredConversation = await resolveAiConversation(userId, "conv_missing");
    assert.equal(recoveredConversation.id, "conv_default");

    const existingConversation = await resolveAiConversation(userId, "conv_live");
    assert.equal(existingConversation.id, "conv_live");

    const rejectedMessage = await addAiMessage({
      userId,
      conversationId: "conv_missing",
      role: "user",
      content: "Hello",
    });
    assert.equal(rejectedMessage, null);

    console.log("assistant conversation recovery rules passed");
  } finally {
    prismaAny.aiConversation.findFirst = originalAiConversationFindFirst;
    prismaAny.aiConversation.create = originalAiConversationCreate;
    prismaAny.aiMessage.create = originalAiMessageCreate;
    prismaAny.aiMemory.findMany = originalAiMemoryFindMany;
    prismaAny.$transaction = originalTransaction;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
