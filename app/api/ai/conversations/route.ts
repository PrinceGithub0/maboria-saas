import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import {
  createAiConversation,
  ensureDefaultAiConversation,
  listAiConversations,
} from "@/lib/assistant-conversations";

export const GET = withErrorHandling(async () => {
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

  const conversations = await listAiConversations(session.user.id);
  if (conversations.length === 0) {
    const fallback = await ensureDefaultAiConversation(session.user.id);
    return NextResponse.json({
      items: [
        {
          id: fallback.id,
          title: fallback.title,
          lastMessageAt: fallback.lastMessageAt,
          updatedAt: fallback.updatedAt,
          createdAt: fallback.createdAt,
        },
      ],
    });
  }
  return NextResponse.json({ items: conversations });
});

export const POST = withErrorHandling(async (req: Request) => {
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

  const body = await req.json().catch(() => ({}));
  const conversation = await createAiConversation(session.user.id, body?.title);
  return NextResponse.json({ item: conversation }, { status: 201 });
});
