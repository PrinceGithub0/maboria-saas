import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { emitUnifiedInboxEvent } from "@/lib/inbox/events";
import { applyUnifiedOutboundActivity } from "@/lib/inbox/conversation-participants";
import { requireUnifiedInboxAccess, writeUnifiedAuditEvent } from "@/lib/inbox/unified";
import {
  buildConversationEmailSubject,
  decryptInboxCredentials,
  ensureOutboundQuota,
  finalizeOutboundMessage,
  formatUnifiedInboxReplyToAddress,
  sendOutboundEmail,
  sendOutboundWhatsApp,
} from "@/lib/inbox/channels";
import { prisma } from "@/lib/prisma";

async function validateRetryChannelState(input: {
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

function resolveStoredSubject(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const subject = (metadata as Record<string, unknown>).subject;
  return typeof subject === "string" && subject.trim() ? subject.trim() : null;
}

export const POST = withErrorHandling(async (_req: Request, ctx: { params: Promise<{ id: string; messageId: string }> }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);
  const { id, messageId } = await ctx.params;

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
      messages: {
        where: {
          id: messageId,
        },
        take: 1,
      },
    },
  });

  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const message = conversation.messages[0];
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  if (message.direction !== "OUTBOUND") {
    return NextResponse.json({ error: "Only outbound messages can be retried." }, { status: 422 });
  }
  if (message.deliveryStatus !== "FAILED") {
    return NextResponse.json({ error: "Only failed messages can be retried." }, { status: 422 });
  }

  const channelValidation = await validateRetryChannelState({
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
    channel: message.channel,
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

  const lastSubjectAudit = await prisma.unifiedAuditEvent.findFirst({
    where: {
      tenantId: context.orgId,
      messageId: message.id,
      actionType: {
        in: ["outbound.sent", "outbound.failed"],
      },
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });

  const emailCredentials =
    conversation.inbox.type === "EMAIL"
      ? decryptInboxCredentials(conversation.inbox.credentialsEncrypted)
      : null;
  const isOauthEmailConversation = Boolean(
    emailCredentials && String(emailCredentials.emailOAuth?.connectedMailboxId || "").trim()
  );
  const retryAt = new Date();
  const subject =
    resolveStoredSubject(lastSubjectAudit?.metadata) ||
    buildConversationEmailSubject({
      conversationId: conversation.id,
      contactName: conversation.contact.name,
    });

  await prisma.unifiedMessage.update({
    where: { id: message.id },
    data: {
      createdAt: retryAt,
      deliveryStatus: "QUEUED",
      externalId: null,
      errorCode: null,
      errorMessage: null,
    },
  });

  const outboundResult =
    message.channel === "EMAIL"
      ? await sendOutboundEmail({
          inbox: conversation.inbox,
          conversationId: conversation.id,
          toEmail: conversation.contact.email || "",
          subject,
          html: `<p>${String(message.content || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</p>`,
          text: message.content,
          replyTo: isOauthEmailConversation
            ? undefined
            : formatUnifiedInboxReplyToAddress(context.orgId, conversation.id),
          headers: {
            "X-Conversation-ID": conversation.id,
          },
          attachments: Array.isArray(message.attachments) ? (message.attachments as any[]) : [],
        })
      : await sendOutboundWhatsApp({
          inbox: conversation.inbox,
          toPhone: conversation.contact.phone || "",
          content: message.content,
        });

  await prisma.$transaction(async (tx) => {
    await finalizeOutboundMessage({
      tx,
      tenantId: context.orgId,
      messageId: message.id,
      channel: message.channel,
      result: outboundResult,
    });

    await applyUnifiedOutboundActivity(tx, {
      tenantId: context.orgId,
      conversationId: conversation.id,
      actorUserId: session.user.id,
      occurredAt: retryAt,
    });

    await writeUnifiedAuditEvent(tx, {
      tenantId: context.orgId,
      actorUserId: session.user.id,
      actionType: outboundResult.deliveryStatus === "SENT" ? "outbound.sent" : "outbound.failed",
      conversationId: conversation.id,
      messageId: message.id,
      metadata: {
        channel: message.channel,
        subject,
        retry: true,
        externalId: outboundResult.externalId,
        providerThreadId: outboundResult.providerThreadId,
        errorCode: outboundResult.errorCode,
        errorMessage: outboundResult.errorMessage,
      },
    });
  });

  await emitUnifiedInboxEvent({
    tenantId: context.orgId,
    type: "message.sent",
    conversationId: conversation.id,
    actorUserId: session.user.id,
    metadata: {
      messageId: message.id,
      channel: message.channel,
      retry: true,
      deliveryStatus: outboundResult.deliveryStatus,
    },
  });

  const responseMessage = await prisma.unifiedMessage.findUnique({
    where: { id: message.id },
  });

  return NextResponse.json(responseMessage, {
    status: outboundResult.deliveryStatus === "SENT" ? 200 : 409,
  });
});
