import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireUnifiedInboxAccess, writeUnifiedAuditEvent } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

export const DELETE = withErrorHandling(
  async (_req: Request, ctx: { params: Promise<{ id: string; noteId: string }> }) => {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const context = await requireUnifiedInboxAccess(session.user.id);
    const { id, noteId } = await ctx.params;

    const note = await prisma.unifiedNote.findFirst({
      where: {
        id: noteId,
        conversationId: id,
        tenantId: context.orgId,
      },
      select: {
        id: true,
        conversationId: true,
        authorUserId: true,
      },
    });

    if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 });

    const member = await prisma.businessMember.findUnique({
      where: {
        businessId_userId: {
          businessId: context.orgId,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    const canDelete = note.authorUserId === session.user.id || member?.role === "owner" || member?.role === "admin";
    if (!canDelete) {
      return NextResponse.json({ error: "You cannot delete this note." }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.unifiedNote.delete({
        where: { id: note.id },
      });
      await writeUnifiedAuditEvent(tx, {
        tenantId: context.orgId,
        actorUserId: session.user.id,
        actionType: "conversation.note_deleted",
        conversationId: note.conversationId,
        metadata: {
          noteId: note.id,
        },
      });
    });

    return NextResponse.json({ ok: true });
  }
);
