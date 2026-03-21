import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireUnifiedInboxAccess, writeUnifiedAuditEvent } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

export const GET = withErrorHandling(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);
  const { id } = await ctx.params;

  const exists = await prisma.unifiedConversation.findFirst({
    where: { id, tenantId: context.orgId },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const notes = await prisma.unifiedNote.findMany({
    where: {
      tenantId: context.orgId,
      conversationId: exists.id,
    },
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return NextResponse.json({ items: notes });
});

export const POST = withErrorHandling(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);
  const body = await req.json().catch(() => ({}));
  const content = String(body?.content || "").trim();
  if (!content) return NextResponse.json({ error: "Note content is required." }, { status: 422 });
  const { id } = await ctx.params;

  const conversation = await prisma.unifiedConversation.findFirst({
    where: { id, tenantId: context.orgId },
    select: { id: true },
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.unifiedNote.create({
      data: {
        tenantId: context.orgId,
        conversationId: conversation.id,
        authorUserId: session.user.id,
        content,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    await writeUnifiedAuditEvent(tx, {
      tenantId: context.orgId,
      actorUserId: session.user.id,
      actionType: "conversation.note_added",
      conversationId: conversation.id,
      metadata: {
        noteId: created.id,
      },
    });
    return created;
  });

  return NextResponse.json(note, { status: 201 });
});
