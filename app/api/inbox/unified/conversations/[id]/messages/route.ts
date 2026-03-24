import { UnifiedMessageDirection } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { emitUnifiedInboxEvent } from "@/lib/inbox/events";
import {
  applyUnifiedInboundActivity,
  applyUnifiedOutboundActivity,
  expireUnifiedConversationSnoozes,
  markUnifiedConversationSeen,
} from "@/lib/inbox/conversation-participants";
import {
  isUnifiedMessageChannel,
  requireUnifiedInboxAccess,
  writeUnifiedAuditEvent,
} from "@/lib/inbox/unified";
import {
  buildConversationEmailSubject,
  decryptInboxCredentials,
  ensureOutboundQuota,
  finalizeOutboundMessage,
  sendOutboundEmail,
  sendOutboundWhatsApp,
} from "@/lib/inbox/channels";
import { prisma } from "@/lib/prisma";

function escapeEmailHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function validateOutboundChannelState(input: {
  tenantId: string;
  inbox: {
    id: string;
    type: "EMAIL" | "WHATSAPP";
    status?: string | null;
    credentialsEncrypted: string | null;
  };
  contact: {
    email: string | null;
    phone: string | null;
  };
}) {
  if (input.inbox.type === "EMAIL") {
    const credentials = decryptInboxCredentials(input.inbox.credentialsEncrypted);
    const oauthMailboxId = String(credentials.emailOAuth?.connectedMailboxId || "").trim();

    if (!input.contact.email) {
      return { ok: false as const, status: 422, error: "Customer email address is missing." };
    }
    if (String(input.inbox.status || "").toUpperCase() !== "ACTIVE") {
      return { ok: false as const, status: 409, error: "Email channel is disconnected. Reconnect the mailbox before sending." };
    }

    if (oauthMailboxId) {
      const mailbox = await prisma.connectedMailbox.findFirst({
        where: {
          id: oauthMailboxId,
          workspaceId: input.tenantId,
        },
        select: { id: true, status: true },
      });
      if (!mailbox || mailbox.status !== "ACTIVE") {
        return {
          ok: false as const,
          status: 409,
          error: "Email channel is disconnected. Reconnect Gmail or Outlook before sending.",
        };
      }
      return { ok: true as const };
    }

    if (!credentials.email?.host || !credentials.email?.username || !credentials.email?.password) {
      return {
        ok: false as const,
        status: 409,
        error: "Email channel is disconnected. Configure SMTP or connect Gmail/Outlook before sending.",
      };
    }

    return { ok: true as const };
  }

  const credentials = decryptInboxCredentials(input.inbox.credentialsEncrypted);
  if (!input.contact.phone) {
    return { ok: false as const, status: 422, error: "Customer phone number is missing." };
  }
  if (String(input.inbox.status || "").toUpperCase() !== "ACTIVE") {
    return { ok: false as const, status: 409, error: "WhatsApp channel is disconnected. Reconnect WhatsApp Business before sending." };
  }
  if (!credentials.whatsapp?.accessToken || !credentials.whatsapp?.phoneNumberId) {
    return {
      ok: false as const,
      status: 409,
      error: "WhatsApp channel is disconnected. Reconnect WhatsApp Business before sending.",
    };
  }
  return { ok: true as const };
}

export const GET = withErrorHandling(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);
  await expireUnifiedConversationSnoozes(prisma, { tenantId: context.orgId });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 250) : 100;
  const { id } = await ctx.params;

  const conversation = await prisma.unifiedConversation.findFirst({
    where: {
      id,
      tenantId: context.orgId,
    },
    select: { id: true },
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const messages = await prisma.unifiedMessage.findMany({
    where: {
      conversationId: conversation.id,
      tenantId: context.orgId,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  await markUnifiedConversationSeen(prisma, {
    tenantId: context.orgId,
    conversationId: conversation.id,
    userId: session.user.id,
    lastMessageAt: messages[messages.length - 1]?.createdAt ?? null,
  });

  return NextResponse.json({ items: messages });
});

export const POST = withErrorHandling(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);
  const body = await req.json().catch(() => ({}));
  await expireUnifiedConversationSnoozes(prisma, { tenantId: context.orgId });

  const content = String(body?.content || "").trim();
  if (!content) return NextResponse.json({ error: "Message content is required." }, { status: 422 });

  const direction = String(body?.direction || "OUTBOUND").trim().toUpperCase();
  const normalizedDirection: UnifiedMessageDirection =
    direction === "INBOUND" || direction === "OUTBOUND" || direction === "INTERNAL" || direction === "SYSTEM"
      ? (direction as UnifiedMessageDirection)
      : "OUTBOUND";

  const requestedChannel = String(body?.channel || "").trim().toUpperCase();
  if (requestedChannel && !isUnifiedMessageChannel(requestedChannel)) {
    return NextResponse.json({ error: "Invalid channel." }, { status: 422 });
  }
  const { id } = await ctx.params;

  const conversation = await prisma.unifiedConversation.findFirst({
    where: {
      id,
      tenantId: context.orgId,
    },
    include: {
      inbox: {
        select: { id: true, type: true, status: true, credentialsEncrypted: true },
      },
      contact: {
        select: { id: true, name: true, email: true, phone: true },
      },
    },
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const channel = isUnifiedMessageChannel(requestedChannel)
    ? requestedChannel
    : conversation.inbox.type === "EMAIL"
      ? "EMAIL"
      : "WHATSAPP";

  if (requestedChannel && channel !== conversation.inbox.type) {
    return NextResponse.json(
      {
        error: `This conversation is locked to ${conversation.inbox.type === "EMAIL" ? "email" : "WhatsApp"} replies.`,
      },
      { status: 422 }
    );
  }

  if (normalizedDirection === "OUTBOUND") {
    const channelValidation = await validateOutboundChannelState({
      tenantId: context.orgId,
      inbox: conversation.inbox,
      contact: conversation.contact,
    });
    if (!channelValidation.ok) {
      return NextResponse.json({ error: channelValidation.error }, { status: channelValidation.status });
    }

    const quota = await ensureOutboundQuota({
      userId: session.user.id,
      tenantId: context.orgId,
      channel,
      orgPlan: context.orgPlan ?? null,
    });
    if (!quota.ok) {
      return NextResponse.json(
        {
          error: quota.error,
          type: "upgrade_required",
          details: quota.details,
        },
        { status: quota.status }
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const message = await tx.unifiedMessage.create({
      data: {
        tenantId: context.orgId,
        conversationId: conversation.id,
        inboxId: conversation.inboxId,
        direction: normalizedDirection,
        channel,
        externalId: body?.externalId ? String(body.externalId) : null,
        senderIdentifier: body?.senderIdentifier ? String(body.senderIdentifier) : null,
        content,
        attachments: Array.isArray(body?.attachments) ? body.attachments : undefined,
        deliveryStatus: normalizedDirection === "OUTBOUND" ? "QUEUED" : "DELIVERED",
      },
    });

    if (normalizedDirection === "INBOUND") {
      await applyUnifiedInboundActivity(tx, {
        tenantId: context.orgId,
        conversationId: conversation.id,
        occurredAt: message.createdAt,
      });
    } else {
      await applyUnifiedOutboundActivity(tx, {
        tenantId: context.orgId,
        conversationId: conversation.id,
        actorUserId: session.user.id,
        occurredAt: message.createdAt,
      });
    }

    await writeUnifiedAuditEvent(tx, {
      tenantId: context.orgId,
      actorUserId: session.user.id,
      actionType: normalizedDirection === "INBOUND" ? "message.received" : "message.sent",
      conversationId: conversation.id,
      messageId: message.id,
      metadata: {
        channel,
        direction: normalizedDirection,
      },
    });

    return message;
  });

  if (normalizedDirection === "OUTBOUND") {
    const emailHtml = `<p>${escapeEmailHtml(content).replace(/\n/g, "<br/>")}</p>`;
    const outboundResult =
      channel === "EMAIL"
        ? await sendOutboundEmail({
            inbox: conversation.inbox,
            conversationId: conversation.id,
            toEmail: conversation.contact.email,
            subject:
              String(body?.subject || "").trim() ||
              buildConversationEmailSubject({
                conversationId: conversation.id,
                contactName: conversation.contact.name,
              }),
            html: emailHtml,
            text: content,
            replyTo: String(body?.replyTo || "").trim() || undefined,
            headers: {
              "X-Conversation-ID": conversation.id,
            },
            attachments: Array.isArray(body?.attachments) ? body.attachments : [],
          })
        : await sendOutboundWhatsApp({
            inbox: conversation.inbox,
            toPhone: conversation.contact.phone || "",
            content,
          });

    await prisma.$transaction(async (tx) => {
      await finalizeOutboundMessage({
        tx,
        tenantId: context.orgId,
        messageId: created.id,
        channel,
        result: outboundResult,
      });
      await writeUnifiedAuditEvent(tx, {
        tenantId: context.orgId,
        actorUserId: session.user.id,
        actionType: outboundResult.deliveryStatus === "SENT" ? "outbound.sent" : "outbound.failed",
        conversationId: conversation.id,
        messageId: created.id,
        metadata: {
          channel,
          externalId: outboundResult.externalId,
          errorCode: outboundResult.errorCode,
          errorMessage: outboundResult.errorMessage,
        },
      });
    });
  }

  const responseMessage = await prisma.unifiedMessage.findUnique({
    where: { id: created.id },
  });

  await emitUnifiedInboxEvent({
    tenantId: context.orgId,
    type: normalizedDirection === "INBOUND" ? "message.received" : "message.sent",
    conversationId: conversation.id,
    actorUserId: session.user.id,
    metadata: {
      messageId: created.id,
      channel,
      deliveryStatus: responseMessage?.deliveryStatus ?? created.deliveryStatus,
    },
  });

  return NextResponse.json(responseMessage ?? created, { status: 201 });
});
