import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { createOrGetCustomer } from "@/lib/customers";
import {
  ensureDefaultUnifiedInboxes,
  isUnifiedConversationStatus,
  isUnifiedMessageChannel,
  requireUnifiedInboxAccess,
  writeUnifiedAuditEvent,
} from "@/lib/inbox/unified";
import {
  ensureUnifiedConversationParticipants,
  expireUnifiedConversationSnoozes,
} from "@/lib/inbox/conversation-participants";
import { createOrResolveCustomerForInbound, decryptInboxCredentials } from "@/lib/inbox/channels";
import { prisma } from "@/lib/prisma";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await requireUnifiedInboxAccess(session.user.id);
  await ensureDefaultUnifiedInboxes(context.orgId);
  await expireUnifiedConversationSnoozes(prisma, { tenantId: context.orgId });

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
      participants: {
        where: { userId: session.user.id },
        select: {
          unreadCount: true,
          lastSeenAt: true,
        },
        take: 1,
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
      unreadCount: item.participants[0]?.unreadCount ?? 0,
      snoozedUntil: item.snoozedUntil,
      waitingSince: item.waitingSince,
      lastInboundAt: item.lastInboundAt,
      lastOutboundAt: item.lastOutboundAt,
      resolvedAt: item.resolvedAt,
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

  const requestedContactId = String(body?.contactId || "").trim();
  const rawContact =
    body?.contact && typeof body.contact === "object" && !Array.isArray(body.contact) ? body.contact : null;
  const requestedInboxId = String(body?.inboxId || "").trim();
  const requestedChannel = String(body?.channel || "").trim().toUpperCase();

  const emailInboxes = await prisma.unifiedInbox.findMany({
    where: {
      tenantId: context.orgId,
      type: "EMAIL",
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      tenantId: true,
      type: true,
      name: true,
      status: true,
      credentialsEncrypted: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const activeEmailInbox =
    emailInboxes.find((item) => {
      const connectedMailboxId = String(
        decryptInboxCredentials(item.credentialsEncrypted).emailOAuth?.connectedMailboxId || ""
      ).trim();
      return item.status === "ACTIVE" && Boolean(connectedMailboxId);
    }) || emailInboxes.find((item) => item.status === "ACTIVE");

  const inbox = requestedInboxId
    ? await prisma.unifiedInbox.findFirst({
        where: { id: requestedInboxId, tenantId: context.orgId },
      })
    : isUnifiedMessageChannel(requestedChannel)
      ? requestedChannel === "EMAIL"
        ? activeEmailInbox || defaults.email
        : defaults.whatsapp
      : defaults.whatsapp;

  if (!inbox) return NextResponse.json({ error: "Inbox not found." }, { status: 404 });
  if (requestedChannel === "EMAIL" && inbox.type !== "EMAIL") {
    return NextResponse.json({ error: "Selected inbox is not an email inbox." }, { status: 422 });
  }
  if (requestedChannel === "WHATSAPP" && inbox.type !== "WHATSAPP") {
    return NextResponse.json({ error: "Selected inbox is not a WhatsApp inbox." }, { status: 422 });
  }

  const resolvedChannel = inbox.type === "EMAIL" ? "EMAIL" : "WHATSAPP";

  let contactId = requestedContactId;
  if (!contactId) {
    const email = String(rawContact?.email || "")
      .trim()
      .toLowerCase();
    const phone = String(rawContact?.phone || "").trim();
    const name = String(rawContact?.name || "").trim();

    if (!email && !phone) {
      return NextResponse.json({ error: "Contact email or phone is required." }, { status: 422 });
    }
    if (resolvedChannel === "EMAIL" && !email) {
      return NextResponse.json({ error: "Contact email is required for email conversations." }, { status: 422 });
    }
    if (resolvedChannel === "WHATSAPP" && !phone) {
      return NextResponse.json({ error: "Contact phone is required for WhatsApp conversations." }, { status: 422 });
    }

    const contact = email
      ? await createOrGetCustomer({
          userId: context.ownerUserId,
          name: name || email || phone || "Unknown Customer",
          email,
          phone: phone || null,
          deliveryPreference: resolvedChannel === "WHATSAPP" ? "WHATSAPP" : "EMAIL",
        })
      : await createOrResolveCustomerForInbound({
          tenantId: context.orgId,
          ownerId: context.ownerUserId,
          channel: resolvedChannel,
          email: null,
          phone: phone || null,
          displayName: name || null,
        });
    contactId = contact.id;
  }

  const existingContact = await prisma.customer.findFirst({
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
    select: { id: true, kind: true },
  });

  if (!existingContact) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  if (existingContact.kind !== "CUSTOMER") {
    await prisma.customer.update({
      where: { id: existingContact.id },
      data: {
        kind: "CUSTOMER",
        deletedAt: null,
        status: "ACTIVE",
      },
    });
  }
  const requestedAssignedUserId = body?.assignedUserId ? String(body.assignedUserId) : null;

  const created = await prisma.$transaction(async (tx) => {
    const existingConversation = await tx.unifiedConversation.findFirst({
      where: {
        tenantId: context.orgId,
        inboxId: inbox.id,
        contactId,
        status: {
          in: ["OPEN", "WAITING_ON_CUSTOMER", "SNOOZED"],
        },
      },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        inbox: { select: { id: true, name: true, type: true, status: true } },
        contact: { select: { id: true, name: true, email: true, phone: true, status: true } },
      },
    });

    const conversation = existingConversation
      ? requestedAssignedUserId && existingConversation.assignedUserId !== requestedAssignedUserId
        ? await tx.unifiedConversation.update({
            where: { id: existingConversation.id },
            data: {
              assignedUserId: requestedAssignedUserId,
            },
            include: {
              inbox: { select: { id: true, name: true, type: true, status: true } },
              contact: { select: { id: true, name: true, email: true, phone: true, status: true } },
            },
          })
        : existingConversation
      : await tx.unifiedConversation.create({
          data: {
            tenantId: context.orgId,
            inboxId: inbox.id,
            contactId,
            status: "OPEN",
            assignedUserId: requestedAssignedUserId,
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
      actionType: existingConversation ? "conversation.reused" : "conversation.created",
      conversationId: conversation.id,
      metadata: {
        contactId: conversation.contactId,
        inboxId: conversation.inboxId,
      },
    });

    await ensureUnifiedConversationParticipants(tx, {
      tenantId: context.orgId,
      conversationId: conversation.id,
    });

    return {
      conversation,
      reused: Boolean(existingConversation),
    };
  });

  return NextResponse.json(created.conversation, { status: created.reused ? 200 : 201 });
});
