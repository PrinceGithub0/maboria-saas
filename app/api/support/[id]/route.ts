import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { sendSupportMail } from "@/lib/email";
import { log } from "@/lib/logger";
import { ensureUserPublicId } from "@/lib/public-id";
import { supportReplySchema } from "@/lib/validators";
import {
  createSupportMessage,
  findSupportTicketForSubscriber,
  normalizeSupportVersion,
  reopenSupportTicketForSubscriber,
  updateSupportMessageDeliveryState,
} from "@/lib/support/threading";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { persistSupportAttachments } from "@/lib/support-attachments";
import { formatTicketReplyToAddress, formatTicketSubject } from "@/lib/support/email-thread";
import { requireSystemFlag } from "@/lib/system-flags-guard";

type Params = { params: { id: string } };

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeEmailError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("self-signed certificate")) {
    return "Support email delivery failed due to SMTP certificate. Reply saved.";
  }
  if (lower.includes("econnreset") || lower.includes("timeout")) {
    return "Support email delivery failed due to a temporary connection issue. Reply saved.";
  }
  return "Support email delivery failed. Reply saved.";
}

function serializeSupportTicket(ticket: any) {
  const rootMessage = ticket.messages.find((message: any) => message.senderType === "SUBSCRIBER");
  const replies = ticket.messages.slice(1).map((message: any) => ({
    id: message.id,
    body: message.content,
    createdAt: message.createdAt,
    senderType: message.senderType,
    deliveryStatus: message.deliveryStatus,
    attachments: (message.attachments as any) || [],
  }));

  return {
    id: ticket.id,
    title: ticket.subject,
    message: rootMessage?.content || "",
    version: ticket.version,
    status: ticket.status === "PENDING" ? "IN_PROGRESS" : ticket.status,
    createdAt: ticket.createdAt,
    metadata: {
      attachments: (rootMessage?.attachments as any) || [],
      subscriberUnreadCount: ticket.subscriberUnreadCount,
      adminUnreadCount: ticket.adminUnreadCount,
      firstResponseAt: ticket.firstResponseAt,
      lastActivityAt: ticket.lastActivityAt,
    },
    replies,
  };
}

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ticket = await findSupportTicketForSubscriber(params.id, session.user.id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ticket.subscriberUnreadCount > 0) {
    await prisma.supportThreadTicket.update({
      where: { id: ticket.id },
      data: { subscriberUnreadCount: 0 },
    });
    ticket.subscriberUnreadCount = 0;
  }

  return NextResponse.json(serializeSupportTicket(ticket));
});

export const PUT = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const requestedStatus = String(body?.status || "").trim().toUpperCase();
  if (requestedStatus !== "OPEN") {
    return NextResponse.json({ error: "Subscribers can only reopen tickets." }, { status: 422 });
  }

  const ticket = await findSupportTicketForSubscriber(params.id, session.user.id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ticket.status !== "CLOSED") {
    return NextResponse.json({ error: "Only closed tickets can be reopened." }, { status: 409 });
  }

  const expectedVersion = normalizeSupportVersion(body?.version) ?? ticket.version;
  const result = await reopenSupportTicketForSubscriber({
    ticketId: ticket.id,
    subscriberId: session.user.id,
    expectedVersion,
    workspaceId: ticket.workspaceId,
  });

  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.reason === "NOT_CLOSED") {
      return NextResponse.json({ error: "Only closed tickets can be reopened." }, { status: 409 });
    }
    return NextResponse.json({ error: "Ticket was updated. Refresh and try again.", code: "CONFLICT" }, { status: 409 });
  }

  const updated = result.ticket;
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ...updated, status: updated.status === "PENDING" ? "IN_PROGRESS" : updated.status });
});

export const POST = withErrorHandling(async (req: Request, { params }: Params) => {
  const supportDisabled = await requireSystemFlag("support_enabled", "Support is currently disabled.");
  if (supportDisabled) return supportDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ticket = await findSupportTicketForSubscriber(params.id, session.user.id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = supportReplySchema.parse(body);
  assertRateLimit(`support-reply:${session.user.id}:${ticket.id}`);
  const decodedAttachments = (parsed.attachments || []).map((attachment) => {
    const normalizedBase64 = attachment.base64.includes(",")
      ? attachment.base64.split(",").pop() || ""
      : attachment.base64;
    const buffer = Buffer.from(normalizedBase64, "base64");
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
      throw new Error("Attachment is invalid or exceeds 5MB.");
    }
    return {
      filename: attachment.filename,
      content: buffer,
      contentType: attachment.contentType,
      sizeBytes: buffer.length,
    };
  });

  const storedAttachments =
    decodedAttachments.length > 0
      ? await persistSupportAttachments(
          ticket.id,
          decodedAttachments.map((attachment) => ({
            filename: attachment.filename,
            contentType: attachment.contentType,
            sizeBytes: attachment.sizeBytes,
            content: attachment.content,
          }))
        )
      : undefined;

  const lastThreaded = [...ticket.messages]
    .reverse()
    .find((message) => Boolean(message.messageIdHeader));
  const references = [...ticket.messages]
    .map((message) => String(message.messageIdHeader || "").trim())
    .filter(Boolean)
    .slice(-15);

  const created = await createSupportMessage({
    ticketId: ticket.id,
    senderType: "SUBSCRIBER",
    senderId: session.user.id,
    channel: "APP",
    content: parsed.message,
    attachments: storedAttachments,
    deliveryStatus: "QUEUED",
    inReplyToHeader: lastThreaded?.messageIdHeader || null,
    referencesHeader: references.length ? references.join(" ") : null,
    workspaceId: ticket.workspaceId,
  });
  if (!created) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const publicId = await ensureUserPublicId(session.user.id);
  const supportRecipient =
    process.env.SUPPORT_EMAIL || process.env.EMAIL_SUPPORT_FROM || process.env.EMAIL_FROM || "support@mail.maboria.com";

  let emailError: string | null = null;
  let deliveryStatus: "SENT" | "FAILED" = "FAILED";
  let messageIdHeader: string | null = null;
  try {
    const emailHeaders: Record<string, string> = {
      "X-Ticket-ID": ticket.id,
      "X-Workspace-ID": ticket.workspaceId,
    };
    if (lastThreaded?.messageIdHeader) {
      emailHeaders["In-Reply-To"] = lastThreaded.messageIdHeader;
    }
    if (references.length) {
      emailHeaders["References"] = references.join(" ");
    }

    const sent = await sendSupportMail({
      to: supportRecipient,
      subject: `${formatTicketSubject(ticket.id, ticket.subject)} (User ID: ${publicId})`,
      html: `<p>A subscriber replied to an existing support ticket.</p>
<p><strong>User:</strong> ${escapeHtml(session.user.email || "")}</p>
<p><strong>User ID:</strong> ${escapeHtml(publicId)}</p>
<p><strong>Workspace:</strong> ${escapeHtml(ticket.workspaceId)}</p>
<p><strong>Ticket ID:</strong> ${escapeHtml(ticket.id)}</p>
<p><strong>Title:</strong> ${escapeHtml(ticket.subject)}</p>
<p><strong>Attachments:</strong> ${escapeHtml(decodedAttachments.length ? decodedAttachments.map((attachment) => attachment.filename).join(", ") : "None")}</p>
<p><strong>Reply:</strong></p>
<pre style="white-space:pre-wrap;">${escapeHtml(parsed.message)}</pre>`,
      replyTo: formatTicketReplyToAddress(ticket.id),
      headers: emailHeaders,
      attachments: decodedAttachments.length
        ? decodedAttachments.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content,
            contentType: attachment.contentType,
          }))
        : undefined,
    });
    messageIdHeader = sent?.messageId || null;
    deliveryStatus = "SENT";
  } catch (error: any) {
    const rawMessage = String(error?.message || "Failed to send support email");
    emailError = sanitizeEmailError(rawMessage);
    log("error", "support_reply_email_failed", {
      ticketId: ticket.id,
      userId: session.user.id,
      error: rawMessage,
    });
  }

  await updateSupportMessageDeliveryState({
    messageId: created.id,
    deliveryStatus,
    errorMessage: emailError,
    messageIdHeader,
  });

  const updated = await findSupportTicketForSubscriber(ticket.id, session.user.id);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    { ticket: serializeSupportTicket(updated), emailError },
    { status: emailError ? 202 : 201 }
  );
});
