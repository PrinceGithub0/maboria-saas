import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import {
  ensureDefaultUnifiedInboxes,
  isUnifiedConversationStatus,
  isUnifiedMessageChannel,
  requireUnifiedInboxAccess,
  writeUnifiedAuditEvent,
} from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await requireUnifiedInboxAccess(session.user.id);
  await ensureDefaultUnifiedInboxes(context.orgId);

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") || "").trim();
  const status = (url.searchParams.get("status") || "").trim().toUpperCase();
  const assignee = (url.searchParams.get("assignee") || "all").trim().toLowerCase();

  const where: Prisma.UnifiedConversationWhereInput = {
    tenantId: context.orgId,
  };

  if (status && status !== "ALL" && isUnifiedConversationStatus(status)) {
    where.status = status;
  }
  if (assignee === "mine") {
    where.assignedUserId = session.user.id;
  } else if (assignee === "unassigned") {
    where.assignedUserId = null;
  }
  if (search) {
    where.OR = [
      { contact: { name: { contains: search, mode: "insensitive" } } },
      { contact: { email: { contains: search, mode: "insensitive" } } },
      { contact: { phone: { contains: search, mode: "insensitive" } } },
      { messages: { some: { content: { contains: search, mode: "insensitive" } } } },
    ];
  }

  const conversations = await prisma.unifiedConversation.findMany({
    where,
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    include: {
      inbox: {
        select: { id: true, name: true, type: true, status: true },
      },
      contact: {
        select: { id: true, name: true, email: true, phone: true, status: true },
      },
      assignedUser: {
        select: { id: true, name: true, email: true },
      },
      tags: {
        include: {
          tag: {
            select: { id: true, label: true },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const unreadCounts = await prisma.unifiedMessage.groupBy({
    by: ["conversationId"],
    where: {
      tenantId: context.orgId,
      direction: "INBOUND",
      conversationId: {
        in: conversations.map((item) => item.id),
      },
    },
    _count: { _all: true },
  });

  const unreadMap = new Map(unreadCounts.map((row) => [row.conversationId, row._count._all]));

  return NextResponse.json({
    items: conversations.map((item) => ({
      id: item.id,
      status: item.status,
      inbox: item.inbox,
      contact: item.contact,
      assignedUser: item.assignedUser,
      tags: item.tags.map((entry) => entry.tag),
      lastMessageAt: item.lastMessageAt,
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
      unreadCount: unreadMap.get(item.id) ?? 0,
      lastMessage: item.messages[0]
        ? {
            id: item.messages[0].id,
            direction: item.messages[0].direction,
            content: item.messages[0].content,
            createdAt: item.messages[0].createdAt,
            deliveryStatus: item.messages[0].deliveryStatus,
          }
        : null,
    })),
  });
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await requireUnifiedInboxAccess(session.user.id);
  const defaults = await ensureDefaultUnifiedInboxes(context.orgId);
  const body = await req.json().catch(() => ({}));

  const contactId = String(body?.contactId || "").trim();
  if (!contactId) return NextResponse.json({ error: "contactId is required." }, { status: 422 });

  const contact = await prisma.customer.findFirst({
    where: {
      id: contactId,
      deletedAt: null,
      user: {
        businesses: {
          some: {
            businessId: context.orgId,
            status: "active",
          },
        },
      },
    },
    select: { id: true },
  });

  if (!contact) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

  const requestedInboxId = String(body?.inboxId || "").trim();
  const requestedChannel = String(body?.channel || "").trim().toUpperCase();

  const inbox = requestedInboxId
    ? await prisma.unifiedInbox.findFirst({
        where: { id: requestedInboxId, tenantId: context.orgId },
      })
    : isUnifiedMessageChannel(requestedChannel)
      ? requestedChannel === "EMAIL"
        ? defaults.email
        : defaults.whatsapp
      : defaults.whatsapp;

  if (!inbox) return NextResponse.json({ error: "Inbox not found." }, { status: 404 });

  const created = await prisma.$transaction(async (tx) => {
    const conversation = await tx.unifiedConversation.create({
      data: {
        tenantId: context.orgId,
        inboxId: inbox.id,
        contactId,
        status: "OPEN",
        assignedUserId: body?.assignedUserId ? String(body.assignedUserId) : null,
        lastMessageAt: null,
      },
      include: {
        inbox: { select: { id: true, name: true, type: true, status: true } },
        contact: { select: { id: true, name: true, email: true, phone: true, status: true } },
      },
    });

    await writeUnifiedAuditEvent(tx, {
      tenantId: context.orgId,
      actorUserId: session.user.id,
      actionType: "conversation.created",
      conversationId: conversation.id,
      metadata: {
        contactId: conversation.contactId,
        inboxId: conversation.inboxId,
      },
    });

    return conversation;
  });

  return NextResponse.json(created, { status: 201 });
});
