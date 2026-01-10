import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import {
  deleteAiConversation,
  getAiConversationMessages,
  renameAiConversation,
} from "@/lib/assistant-conversations";

const resolveConversationId = (req: Request, ctx?: { params?: { id?: string } }) => {
  if (ctx?.params?.id) return ctx.params.id;
  const path = new URL(req.url).pathname;
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
};

export const GET = withErrorHandling(async (req: Request, ctx?: { params?: { id?: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "ai",
    requiredPlan: "pro",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: "pro",
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const conversationId = resolveConversationId(req, ctx);
  if (!conversationId) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100;

  const result = await getAiConversationMessages(session.user.id, conversationId, limit);
  if (!result) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  return NextResponse.json({
    conversation: {
      id: result.conversation.id,
      title: result.conversation.title,
      lastMessageAt: result.conversation.lastMessageAt,
      updatedAt: result.conversation.updatedAt,
      createdAt: result.conversation.createdAt,
    },
    messages: result.messages.map((entry) => ({
      id: entry.id,
      role: entry.role,
      content: entry.content,
      createdAt: entry.createdAt,
    })),
  });
});

export const PATCH = withErrorHandling(async (req: Request, ctx?: { params?: { id?: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "ai",
    requiredPlan: "pro",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: "pro",
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const conversationId = resolveConversationId(req, ctx);
  if (!conversationId) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!body?.title || String(body.title).trim().length < 2) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const updated = await renameAiConversation(session.user.id, conversationId, String(body.title));
  return NextResponse.json({ item: updated });
});

export const DELETE = withErrorHandling(async (_req: Request, ctx?: { params?: { id?: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "ai",
    requiredPlan: "pro",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: "pro",
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const conversationId = resolveConversationId(_req, ctx);
  if (!conversationId) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  await deleteAiConversation(session.user.id, conversationId);
  return NextResponse.json({ ok: true });
});
