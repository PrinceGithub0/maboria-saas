import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { withErrorHandling } from "@/lib/api-handler";
import { authOptions } from "@/lib/auth";
import { sendSupportMail } from "@/lib/email";
import { formatTicketReplyToAddress, formatTicketSubject } from "@/lib/support/email-thread";
import { buildSupportReplyEmail } from "@/emails/templates/support-reply";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import { persistSupportAttachments } from "@/lib/support-attachments";
import {
  createAdminReplyForSupportTicket,
  getSupportTicketForAdmin,
  normalizeSupportVersion,
  toApiSupportPriority,
  toApiSupportStatus,
  updateSupportMessageDeliveryState,
} from "@/lib/support/threading";
import { getReplyAssignmentDecision } from "@/lib/support/reply-assignment";
import { requireSystemFlag } from "@/lib/system-flags-guard";

type Params = { params: { id: string } };
type ReplyAttachmentInput = {
  filename: string;
  contentType: "image/jpeg" | "image/png" | "application/pdf";
  base64: string;
  sizeBytes: number;
};

const ALLOWED_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

export const POST = withErrorHandling(async (req: Request, { params }: Params) => {
  const supportDisabled = await requireSystemFlag("support_enabled", "Support is currently disabled.");
  if (supportDisabled) return supportDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const access = await requireVerifiedPlatformAdminAccess({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (!access.ok) {
    return access.response;
  }
  const body = await req.json().catch(() => ({}));
  const message = String(body?.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 422 });
  }

  const expectedVersion = normalizeSupportVersion(body?.version);
  if (expectedVersion === null) {
    return NextResponse.json({ error: "version is required" }, { status: 422 });
  }

  const rawAttachments = Array.isArray(body?.attachments) ? (body.attachments as ReplyAttachmentInput[]) : [];
  if (rawAttachments.length > MAX_ATTACHMENTS) {
    return NextResponse.json({ error: `Maximum ${MAX_ATTACHMENTS} attachments allowed.` }, { status: 422 });
  }
  const decodedAttachments: Array<{
    filename: string;
    contentType: ReplyAttachmentInput["contentType"];
    sizeBytes: number;
    content: Buffer;
  }> = [];
  for (const attachment of rawAttachments) {
    const filename = String(attachment?.filename || "").trim();
    const contentType = String(attachment?.contentType || "").trim().toLowerCase();
    const base64Raw = String(attachment?.base64 || "");
    const normalizedBase64 = base64Raw.includes(",") ? base64Raw.split(",").pop() || "" : base64Raw;
    const buffer = Buffer.from(normalizedBase64, "base64");

    if (!filename) {
      return NextResponse.json({ error: "Attachment filename is required." }, { status: 422 });
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(contentType)) {
      return NextResponse.json({ error: "Only JPG, PNG, or PDF attachments are supported." }, { status: 422 });
    }
    if (!buffer.length || buffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
      return NextResponse.json({ error: "Each attachment must be 5MB or smaller." }, { status: 422 });
    }
    decodedAttachments.push({
      filename,
      contentType: contentType as ReplyAttachmentInput["contentType"],
      sizeBytes: buffer.length,
      content: buffer,
    });
  }

  const ticket = await getSupportTicketForAdmin(params.id, null, session.user.id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  if (ticket.archived) {
    return NextResponse.json({ error: "Archived tickets cannot be replied to." }, { status: 400 });
  }

  const decision = getReplyAssignmentDecision({
    assignedAdminId: ticket.assignedAdminId,
    currentAdminId: session.user.id,
  });
  if (decision === "invalid") {
    return NextResponse.json({ error: "Invalid actor context" }, { status: 403 });
  }
  if (decision === "confirm_takeover" && body?.takeover !== true) {
    const assigneeName =
      ticket.assignedAdmin?.name ||
      ticket.assignedAdmin?.email ||
      ticket.assignedAdminId ||
      "another admin";
    return NextResponse.json(
      {
        error: `This ticket is assigned to ${assigneeName}.`,
        code: "TAKEOVER_REQUIRED",
      },
      { status: 409 }
    );
  }

  const reassignToAdminId =
    decision === "assign_and_send" || decision === "confirm_takeover"
      ? session.user.id
      : undefined;

  const lastThreaded = [...ticket.messages]
    .reverse()
    .find((item) => Boolean(item.messageIdHeader));
  const references = [...ticket.messages]
    .map((item) => String(item.messageIdHeader || "").trim())
    .filter(Boolean)
    .slice(-15);

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

  const result = await createAdminReplyForSupportTicket({
    ticketId: ticket.id,
    actorUserId: session.user.id,
    message,
    channel: "APP",
    attachments: storedAttachments,
    deliveryStatus: "QUEUED",
    inReplyToHeader: lastThreaded?.messageIdHeader || null,
    referencesHeader: references.length ? references.join(" ") : null,
    expectedVersion,
    reassignToAdminId,
    workspaceId: null,
  });

  if (!result.ok) {
    if (result.reason === "NOT_FOUND") {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    if (result.reason === "ARCHIVED") {
      return NextResponse.json({ error: "Archived tickets cannot be replied to." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Ticket was updated by another admin.", code: "CONFLICT" },
      { status: 409 }
    );
  }

  let deliveryStatus: "SENT" | "FAILED" = "FAILED";
  let errorMessage: string | null = null;
  let messageIdHeader: string | null = null;
  try {
    const appBaseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || new URL(req.url).origin;
    const viewTicketUrl = `${appBaseUrl.replace(/\/+$/g, "")}/dashboard/support/tickets/${encodeURIComponent(ticket.id)}`;
    const emailTemplate = buildSupportReplyEmail({
      ticketId: ticket.id,
      ticketSubject: ticket.subject,
      message,
      viewTicketUrl,
    });
    const emailHeaders: Record<string, string> = {
      "X-Ticket-ID": ticket.id,
    };
    if (lastThreaded?.messageIdHeader) {
      emailHeaders["In-Reply-To"] = lastThreaded.messageIdHeader;
    }
    if (references.length) {
      emailHeaders["References"] = references.join(" ");
    }
    const sent = await sendSupportMail({
      to: ticket.subscriber.email,
      subject: formatTicketSubject(ticket.id, ticket.subject),
      html: emailTemplate.html,
      text: emailTemplate.text,
      headers: emailHeaders,
      replyTo: formatTicketReplyToAddress(ticket.id),
      attachments: decodedAttachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });
    messageIdHeader = sent?.messageId || null;
    deliveryStatus = "SENT";
  } catch (error: any) {
    errorMessage = String(error?.message || "Failed to send email");
  }

  const persistedMessage = await updateSupportMessageDeliveryState({
    messageId: result.message.id,
    deliveryStatus,
    errorMessage,
    messageIdHeader,
  });

  return NextResponse.json({
    ticket: result.ticket
      ? {
          ...result.ticket,
          status: toApiSupportStatus(result.ticket.status),
          priority: toApiSupportPriority(result.ticket.priority),
        }
      : null,
    message: persistedMessage,
    deliveryStatus,
    errorMessage,
  });
});
