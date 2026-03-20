import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supportTicketSchema } from "@/lib/validators";
import { sendSupportMail } from "@/lib/email";
import { log } from "@/lib/logger";
import { ensureUserPublicId } from "@/lib/public-id";
import { assertRateLimit } from "@/lib/rate-limit";
import { formatTicketReplyToAddress, formatTicketSubject } from "@/lib/support/email-thread";
import { persistSupportAttachments } from "@/lib/support-attachments";
import {
  createSupportThreadTicket,
  listSupportTicketsForSubscriberPaged,
  listSupportTicketsForSubscriber,
  mapLegacyPriority,
  mapLegacyStatus,
  resolveWorkspaceForSubscriber,
  updateSupportMessageAttachments,
} from "@/lib/support/threading";
import { prisma } from "@/lib/prisma";
import { requireSystemFlag } from "@/lib/system-flags-guard";
import { logUserActivity } from "@/lib/user-activity";

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
    return "Support email delivery failed due to SMTP certificate. Ticket saved.";
  }
  if (lower.includes("econnreset") || lower.includes("timeout")) {
    return "Support email delivery failed due to a temporary connection issue. Ticket saved.";
  }
  return "Support email delivery failed. Ticket saved.";
}

function serializeSupportTicket(ticket: any) {
  const rootMessage = ticket.messages.find((message: any) => message.senderType === "SUBSCRIBER");
  const replies = ticket.messages
    .filter((message: any) => message.senderType === "ADMIN")
    .map((message: any) => ({
      id: message.id,
      body: message.content,
      createdAt: message.createdAt,
    }));

  return {
    id: ticket.id,
    title: ticket.subject,
    message: rootMessage?.content || "",
    status: mapLegacyStatus(ticket.status),
    createdAt: ticket.createdAt,
    priority: mapLegacyPriority(ticket.priority),
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

function encodeSupportCursor(cursor: { lastActivityAt: Date; id: string } | null) {
  if (!cursor) return null;
  return Buffer.from(
    JSON.stringify({
      lastActivityAt: cursor.lastActivityAt.toISOString(),
      id: cursor.id,
    }),
    "utf8"
  ).toString("base64url");
}

function decodeSupportCursor(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const lastActivityAt = new Date(String(parsed?.lastActivityAt || ""));
    const id = String(parsed?.id || "");
    if (!id || Number.isNaN(lastActivityAt.getTime())) return null;
    return { lastActivityAt, id };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const requestedLimit = Number(url.searchParams.get("limit") || "50");
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 50;
  const paged = url.searchParams.get("paged") === "1";
  const cursor = decodeSupportCursor(url.searchParams.get("cursor"));
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("q");
  const sort = url.searchParams.get("sort");
  const workspaceId = await resolveWorkspaceForSubscriber(session.user.id);
  if (!workspaceId) {
    return NextResponse.json(paged ? pagedResponse([], null) : []);
  }

  if (paged) {
    const result = await listSupportTicketsForSubscriberPaged({
      subscriberId: session.user.id,
      workspaceId,
      take: limit,
      cursor,
      status,
      search,
      sort,
    });
    return NextResponse.json({
      items: result.items.map((ticket: any) => serializeSupportTicket(ticket)),
      nextCursor: encodeSupportCursor(result.nextCursor),
    });
  }

  const tickets = await listSupportTicketsForSubscriber(session.user.id, { take: limit, workspaceId });
  return NextResponse.json(tickets.map((ticket: any) => serializeSupportTicket(ticket)));
}

function pagedResponse(items: any[], nextCursor: string | null) {
  return {
    items,
    nextCursor,
  };
}

export async function POST(req: Request) {
  const supportDisabled = await requireSystemFlag("support_enabled", "Support is currently disabled.");
  if (supportDisabled) return supportDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    assertRateLimit(`support:${session.user.id}`);
    const body = await req.json();
    const parsed = supportTicketSchema.parse(body);
    const parsedAttachments = parsed.attachments || [];
    const decodedAttachments = parsedAttachments.map((attachment) => {
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

    const workspaceId = await resolveWorkspaceForSubscriber(session.user.id);
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 422 });
    }

    const publicId = await ensureUserPublicId(session.user.id);
    const createdTicket = await createSupportThreadTicket({
      subscriberId: session.user.id,
      workspaceId,
      subject: parsed.title,
      content: parsed.message,
      priority: parsed.priority,
      attachments: undefined,
    });
    const ticket = createdTicket.ticket;

    if (decodedAttachments.length > 0) {
      const storedAttachments = await persistSupportAttachments(
        ticket.id,
        decodedAttachments.map((attachment) => ({
          filename: attachment.filename,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes,
          content: attachment.content,
        }))
      );
      await updateSupportMessageAttachments({
        messageId: createdTicket.rootMessageId,
        attachments: storedAttachments,
      });
    }

    const supportRecipient =
      process.env.SUPPORT_EMAIL || process.env.EMAIL_SUPPORT_FROM || process.env.EMAIL_FROM || "support@mail.maboria.com";
    const ticketReplyTo = formatTicketReplyToAddress(ticket.id);

    let emailError: string | null = null;
    try {
      await sendSupportMail({
        to: supportRecipient,
        subject: `${formatTicketSubject(ticket.id, parsed.title)} (User ID: ${publicId})`,
        html: `<p>A new support ticket was submitted.</p>
<p><strong>User:</strong> ${escapeHtml(session.user.email || "")}</p>
<p><strong>User ID:</strong> ${escapeHtml(publicId)}</p>
<p><strong>Workspace:</strong> ${escapeHtml(workspaceId)}</p>
<p><strong>Ticket ID:</strong> ${escapeHtml(ticket.id)}</p>
<p><strong>Title:</strong> ${escapeHtml(parsed.title)}</p>
<p><strong>Attachments:</strong> ${escapeHtml(decodedAttachments.length ? decodedAttachments.map((a) => a.filename).join(", ") : "None")}</p>
<p><strong>Message:</strong></p>
<pre style="white-space:pre-wrap;">${escapeHtml(parsed.message)}</pre>`,
        replyTo: ticketReplyTo,
        headers: {
          "X-Ticket-ID": ticket.id,
          "X-Workspace-ID": workspaceId,
        },
        attachments: decodedAttachments.length
          ? decodedAttachments.map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content,
              contentType: attachment.contentType,
            }))
          : undefined,
      });

      await logUserActivity({
        tenantId: workspaceId,
        userId: session.user.id,
        actorId: session.user.id,
        eventType: "notification_sent",
        metadata: {
          channel: "email",
          context: "support_ticket_created",
          ticketId: ticket.id,
        },
      });
    } catch (error: any) {
      const rawMessage = error?.message || "Failed to send support email";
      emailError = sanitizeEmailError(rawMessage);
      log("error", "support_email_failed", { error: rawMessage });
    }

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "SUPPORT_TICKET_CREATED",
        metadata: {
          ticketId: ticket.id,
          workspaceId,
          publicId,
        },
      },
    });

    return NextResponse.json({ ticket, emailError }, { status: emailError ? 202 : 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "Failed to submit ticket" }, { status: 400 });
  }
}
