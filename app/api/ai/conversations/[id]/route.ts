import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { decodeAssistantMessageCursor } from "@/lib/assistant-message-cursor";
import {
  deleteAiConversation,
  getAiConversationMessages,
  renameAiConversation,
} from "@/lib/assistant-conversations";

type ConversationPayload = {
  id: string;
  title: string;
  lastMessageAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type MessagePayload = {
  id: string;
  role: string;
  content: string;
  createdAt?: string | Date;
};

const resolveConversationId = async (req: Request, ctx?: { params?: Promise<{ id?: string }> }) => {
  const resolvedParams = ctx?.params ? await ctx.params : null;
  if (resolvedParams?.id) return resolvedParams.id;
  const path = new URL(req.url).pathname;
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
};

export const GET = withErrorHandling(async (req: Request, ctx?: { params?: Promise<{ id?: string }> }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "ai",
    requiredPlan: "free",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan ?? "free",
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const conversationId = await resolveConversationId(req, ctx);
  if (!conversationId) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100;
  const cursor = decodeAssistantMessageCursor(url.searchParams.get("cursor"));

  const pagedResult = (await getAiConversationMessages(
    session.user.id,
    conversationId,
    limit,
    cursor
  )) as
    | { conversation: ConversationPayload; messages: MessagePayload[]; nextCursor?: string | null }
    | null;
  if (!pagedResult) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  return NextResponse.json({
    conversation: {
      id: pagedResult.conversation.id,
      title: pagedResult.conversation.title,
      lastMessageAt: pagedResult.conversation.lastMessageAt,
      updatedAt: pagedResult.conversation.updatedAt,
      createdAt: pagedResult.conversation.createdAt,
    },
    messages: pagedResult.messages.map((entry) => ({
      id: entry.id,
      role: entry.role,
      content: entry.content,
      createdAt: entry.createdAt,
    })),
    nextCursor: pagedResult.nextCursor ?? null,
  });
});

export const PATCH = withErrorHandling(async (req: Request, ctx?: { params?: Promise<{ id?: string }> }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "ai",
    requiredPlan: "free",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan ?? "free",
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const conversationId = await resolveConversationId(req, ctx);
  if (!conversationId) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!body?.title || String(body.title).trim().length < 2) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const updated = await renameAiConversation(session.user.id, conversationId, String(body.title));
  if (!updated) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  return NextResponse.json({ item: updated });
});

export const DELETE = withErrorHandling(async (_req: Request, ctx?: { params?: Promise<{ id?: string }> }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "ai",
    requiredPlan: "free",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan ?? "free",
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const conversationId = await resolveConversationId(_req, ctx);
  if (!conversationId) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const deleted = await deleteAiConversation(session.user.id, conversationId);
  if (!deleted) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
