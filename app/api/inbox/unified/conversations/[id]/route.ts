import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { emitUnifiedInboxEvent } from "@/lib/inbox/events";
import { isUnifiedConversationStatus, requireUnifiedInboxAccess, writeUnifiedAuditEvent } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

function sanitizeTagLabels(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 25);
}

export const GET = withErrorHandling(async (_req: Request, ctx: { params: { id: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);

  const conversation = await prisma.unifiedConversation.findFirst({
    where: {
      id: ctx.params.id,
      tenantId: context.orgId,
    },
    include: {
      inbox: {
        select: { id: true, name: true, type: true, status: true },
      },
      contact: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      assignedUser: {
        select: { id: true, name: true, email: true },
      },
      tags: {
        include: {
          tag: { select: { id: true, label: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: {
          author: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const [recentInvoices, recentPayments] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        customerId: conversation.contactId,
      },
      orderBy: { generatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        currency: true,
        status: true,
        generatedAt: true,
      },
    }),
    prisma.invoicePayment.findMany({
      where: {
        invoice: {
          customerId: conversation.contactId,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        reference: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    id: conversation.id,
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    inbox: conversation.inbox,
    contact: conversation.contact,
    assignedUser: conversation.assignedUser,
    tags: conversation.tags.map((entry) => entry.tag),
    messages: conversation.messages,
    notes: conversation.notes,
    customerInsights: {
      recentInvoices,
      recentPayments,
      overdueInvoices: recentInvoices.filter((invoice) => invoice.status === "OVERDUE"),
    },
  });
});

export const PATCH = withErrorHandling(async (req: Request, ctx: { params: { id: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);
  const body = await req.json().catch(() => ({}));

  const existing = await prisma.unifiedConversation.findFirst({
    where: { id: ctx.params.id, tenantId: context.orgId },
    select: { id: true, status: true, assignedUserId: true },
  });
  if (!existing) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const nextStatusRaw = body?.status ? String(body.status).toUpperCase() : null;
  const nextAssignee = body?.assignedUserId === undefined ? undefined : body.assignedUserId ? String(body.assignedUserId) : null;
  const nextTags = body?.tags === undefined ? undefined : sanitizeTagLabels(body.tags);

  if (nextStatusRaw && !isUnifiedConversationStatus(nextStatusRaw)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 422 });
  }
  const nextStatus = nextStatusRaw && isUnifiedConversationStatus(nextStatusRaw) ? nextStatusRaw : null;

  if (nextAssignee) {
    const assigneeExists = await prisma.businessMember.findFirst({
      where: {
        businessId: context.orgId,
        userId: nextAssignee,
        status: "active",
      },
      select: { id: true },
    });
    if (!assigneeExists) return NextResponse.json({ error: "Assignee not in workspace." }, { status: 422 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updateData: Prisma.UnifiedConversationUncheckedUpdateInput = {};
    if (nextStatus) updateData.status = nextStatus;
    if (nextAssignee !== undefined) updateData.assignedUserId = nextAssignee;

    await tx.unifiedConversation.update({
      where: { id: existing.id },
      data: updateData,
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: { select: { id: true, label: true } } } },
      },
    });

    if (nextTags !== undefined) {
      await tx.unifiedConversationTag.deleteMany({ where: { conversationId: existing.id } });
      if (nextTags.length) {
        for (const label of nextTags) {
          const tag = await tx.unifiedTag.upsert({
            where: {
              tenantId_label: {
                tenantId: context.orgId,
                label,
              },
            },
            update: {},
            create: {
              tenantId: context.orgId,
              label,
            },
          });
          await tx.unifiedConversationTag.create({
            data: {
              tenantId: context.orgId,
              conversationId: existing.id,
              tagId: tag.id,
            },
          });
        }
      }
    }

    if (nextStatus && nextStatus !== existing.status) {
      await writeUnifiedAuditEvent(tx, {
        tenantId: context.orgId,
        actorUserId: session.user.id,
        actionType: "conversation.status_changed",
        conversationId: existing.id,
        metadata: { from: existing.status, to: nextStatus },
      });
    }

    if (nextAssignee !== undefined && nextAssignee !== existing.assignedUserId) {
      await writeUnifiedAuditEvent(tx, {
        tenantId: context.orgId,
        actorUserId: session.user.id,
        actionType: nextAssignee ? "conversation.assigned" : "conversation.unassigned",
        conversationId: existing.id,
        metadata: { assignedUserId: nextAssignee },
      });
    }

    if (nextTags !== undefined) {
      await writeUnifiedAuditEvent(tx, {
        tenantId: context.orgId,
        actorUserId: session.user.id,
        actionType: "conversation.tags_updated",
        conversationId: existing.id,
        metadata: { tags: nextTags },
      });
    }

    const refreshed = await tx.unifiedConversation.findUnique({
      where: { id: existing.id },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
        tags: { include: { tag: { select: { id: true, label: true } } } },
      },
    });
    return refreshed;
  });

  if (nextStatus === "CLOSED" && existing.status !== "CLOSED") {
    await emitUnifiedInboxEvent({
      tenantId: context.orgId,
      type: "conversation.closed",
      conversationId: existing.id,
      actorUserId: session.user.id,
      metadata: { from: existing.status, to: nextStatus },
    });
  }
  if (nextAssignee !== undefined && nextAssignee !== existing.assignedUserId && nextAssignee) {
    await emitUnifiedInboxEvent({
      tenantId: context.orgId,
      type: "conversation.assigned",
      conversationId: existing.id,
      actorUserId: session.user.id,
      metadata: { assignedUserId: nextAssignee },
    });
  }

  return NextResponse.json(result);
});
