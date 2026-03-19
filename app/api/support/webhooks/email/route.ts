import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { sendSupportMail } from "@/lib/email";
import { extractInboundReplyText, logChannelFailure, parseEmailThreadHeaders } from "@/lib/inbox/channels";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { persistResendSupportAttachments } from "@/lib/support-attachments";
import { createSupportMessage, resolveSupportTicketFromInbound } from "@/lib/support/threading";
import { requireSystemFlag } from "@/lib/system-flags-guard";

type SupportInboundPayload = {
  to?: string[];
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ id?: string; filename: string; contentType?: string; sizeBytes?: number; storageKey?: string }>;
};

type ResendInboundWebhookEvent = {
  type?: string;
  data?: {
    email_id?: string;
    attachments?: Array<{
      id?: string | null;
      filename?: string | null;
      content_type?: string | null;
    }>;
  };
};

type ResendReceivedEmail = {
  to?: string[] | string | Array<{ email?: string | null }>;
  from?: string | { email?: string | null };
  subject?: string;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string>;
  message_id?: string | null;
  attachments?: Array<{
    id?: string | null;
    filename?: string;
    content_type?: string | null;
  }>;
};

type ResendReceivedEmailApiResponse =
  | ResendReceivedEmail
  | {
      data?: ResendReceivedEmail | null;
      error?: string;
      message?: string;
    };

function parseWebhookRateLimit() {
  const raw = Number(process.env.WEBHOOK_RATE_LIMIT || 180);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 180;
}

function normalizeHeaderRecord(headers: Record<string, string> | undefined) {
  if (!headers || typeof headers !== "object") return undefined;
  const normalized = Object.fromEntries(
    Object.entries(headers)
      .filter(([key, value]) => Boolean(key) && typeof value === "string")
      .map(([key, value]) => [key, value])
  );
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeResendAddressList(value: ResendReceivedEmail["to"]) {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" ? item : item && typeof item === "object" ? String(item.email || "") : ""
      )
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeResendSender(value: ResendReceivedEmail["from"]) {
  if (typeof value === "string") return value || undefined;
  if (value && typeof value === "object" && value.email) return String(value.email);
  return undefined;
}

function normalizeResendEmail(email: ResendReceivedEmail): SupportInboundPayload {
  const headers = normalizeHeaderRecord(email.headers);
  return {
    to: normalizeResendAddressList(email.to),
    from: normalizeResendSender(email.from),
    subject: email.subject || undefined,
    text: email.text || undefined,
    html: email.html || undefined,
    messageId: email.message_id || headers?.["message-id"] || headers?.["Message-ID"] || undefined,
    headers,
    attachments: Array.isArray(email.attachments)
      ? email.attachments
          .filter((attachment) => Boolean(attachment?.filename))
          .map((attachment) => ({
            id: attachment.id || undefined,
            filename: String(attachment.filename),
            contentType: attachment.content_type || undefined,
          }))
      : undefined,
  };
}

function getSvixHeaders(headers: Headers) {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return null;
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": signature,
  };
}

function verifyResendWebhook(rawBody: string, headers: Headers) {
  const svixHeaders = getSvixHeaders(headers);
  if (!svixHeaders) {
    return { ok: false as const, status: 401, error: "Missing webhook signature." };
  }
  const secret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    return { ok: false as const, status: 500, error: "Resend webhook secret is not configured." };
  }
  try {
    const event = new Webhook(secret).verify(rawBody, svixHeaders) as ResendInboundWebhookEvent;
    return { ok: true as const, event };
  } catch {
    return { ok: false as const, status: 401, error: "Invalid webhook signature." };
  }
}

function unwrapResendReceivedEmail(result: ResendReceivedEmailApiResponse): ResendReceivedEmail {
  if (result && typeof result === "object" && "data" in result && result.data && typeof result.data === "object") {
    return result.data;
  }
  return result as ResendReceivedEmail;
}

async function fetchResendReceivedEmail(emailId: string): Promise<ResendReceivedEmail> {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing Resend API key.");
  }
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const result = (await response.json().catch(() => ({}))) as ResendReceivedEmailApiResponse;
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "message" in result && typeof result.message === "string"
        ? result.message
        : result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error
          : `Failed to retrieve received email (${response.status})`;
    throw new Error(message);
  }
  return unwrapResendReceivedEmail(result);
}

function normalizeRecipients(input: string[] | undefined) {
  if (!input) return [];
  return input.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeSenderEmail(value: string | undefined) {
  const raw = String(value || "");
  const angleMatch = raw.match(/<([^>]+)>/);
  const candidate = angleMatch?.[1] || raw;
  const direct = candidate.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return direct?.[0]?.toLowerCase() || "";
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function maybeForwardHumanMailboxCopy(input: {
  ticketId: string;
  subject: string;
  from: string;
  text: string;
}) {
  const copyRecipient = String(process.env.SUPPORT_EMAIL || "").trim();
  const supportFrom = String(process.env.EMAIL_SUPPORT_FROM || "").trim();
  if (!copyRecipient || !supportFrom || copyRecipient.toLowerCase() === supportFrom.toLowerCase()) {
    return;
  }

  await sendSupportMail({
    to: copyRecipient,
    subject: input.subject || `Inbound support email [Ticket:${input.ticketId}]`,
    html: `<p>Inbound support email copy for ticket ${escapeHtml(input.ticketId)}.</p><p><strong>From:</strong> ${escapeHtml(input.from)}</p><pre style="white-space:pre-wrap;">${escapeHtml(input.text)}</pre>`,
  });
}

export async function POST(req: Request) {
  const ingestDisabled = await requireSystemFlag(
    "webhooks_ingest_enabled",
    "Webhook ingest is currently disabled."
  );
  if (ingestDisabled) return ingestDisabled;

  const supportDisabled = await requireSystemFlag("support_enabled", "Support is currently disabled.");
  if (supportDisabled) return supportDisabled;

  const rawBody = await req.text();
  const verification = verifyResendWebhook(rawBody, req.headers);
  if (!verification.ok) {
    log("warn", "support_webhook_verification_failed", {
      status: verification.status,
      error: verification.error,
    });
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }
  if (verification.event.type !== "email.received") {
    log("info", "support_webhook_ignored_event", {
      type: verification.event.type || "unknown_event",
    });
    return NextResponse.json({ ok: true, ignored: verification.event.type || "unknown_event" });
  }

  const emailId = String(verification.event.data?.email_id || "").trim();
  if (!emailId) {
    return NextResponse.json({ error: "Resend email id missing." }, { status: 422 });
  }

  let payload: SupportInboundPayload;
  try {
    payload = normalizeResendEmail(await fetchResendReceivedEmail(emailId));
  } catch (error: any) {
    log("error", "support_webhook_fetch_failed", {
      emailId,
      error: error?.message || "fetch_failed",
    });
    return NextResponse.json(
      { error: error?.message || "Failed to retrieve inbound support email from Resend." },
      { status: 502 }
    );
  }

  const recipients = normalizeRecipients(payload.to);
  const headerMessageId =
    payload.messageId ||
    payload.headers?.["message-id"] ||
    payload.headers?.["Message-Id"] ||
    payload.headers?.["Message-ID"] ||
    null;
  const headerInReplyTo =
    payload.inReplyTo ||
    payload.headers?.["in-reply-to"] ||
    payload.headers?.["In-Reply-To"] ||
    payload.headers?.["In-reply-to"] ||
    null;
  const headerReferences =
    payload.references ||
    payload.headers?.references ||
    payload.headers?.References ||
    null;

  const threadHeaders = parseEmailThreadHeaders({
    messageId: headerMessageId,
    inReplyTo: headerInReplyTo,
    references: headerReferences,
  });

  const ticket = await resolveSupportTicketFromInbound({
    subject: payload.subject || "",
    to: recipients,
    inReplyTo: threadHeaders.inReplyTo,
    references: threadHeaders.references,
  });
  if (!ticket) {
    log("warn", "support_webhook_ticket_not_resolved", {
      emailId,
      subject: payload.subject || "",
      to: recipients,
      inReplyTo: threadHeaders.inReplyTo,
      references: threadHeaders.references,
    });
    return NextResponse.json({ ok: true, ignored: "ticket_not_resolved" });
  }

  assertRateLimit(`support-email-webhook:${ticket.workspaceId}`, parseWebhookRateLimit(), 60_000);

  const from = normalizeSenderEmail(payload.from);
  if (!from) {
    log("warn", "support_webhook_sender_missing", {
      emailId,
      ticketId: ticket.id,
    });
    return NextResponse.json({ error: "Sender email missing." }, { status: 422 });
  }
  const subscriber = await prisma.user.findUnique({
    where: { id: ticket.subscriberId },
    select: { email: true },
  });
  if (!subscriber?.email || subscriber.email.trim().toLowerCase() !== from) {
    log("warn", "support_webhook_sender_mismatch", {
      emailId,
      ticketId: ticket.id,
      expected: subscriber?.email || null,
      from,
    });
    await logChannelFailure({
      tenantId: ticket.workspaceId,
      actionType: "support.webhook.rejected",
      metadata: {
        provider: "resend",
        scope: "support",
        ticketId: ticket.id,
        reason: "sender_mismatch",
        from,
      },
    });
    return NextResponse.json({ error: "Sender does not match ticket subscriber." }, { status: 403 });
  }
  const bodyText = extractInboundReplyText({
    text: payload.text,
    html: payload.html,
  });
  if (!bodyText) {
    return NextResponse.json({ ok: true, ignored: "empty_body" });
  }

  let attachments: Awaited<ReturnType<typeof persistResendSupportAttachments>> = [];
  const eventAttachments = Array.isArray(verification.event.data?.attachments)
    ? verification.event.data.attachments
        .map((item) => ({
          id: String(item?.id || "").trim(),
          filename: item?.filename ? String(item.filename) : undefined,
          contentType: item?.content_type ? String(item.content_type) : undefined,
        }))
        .filter((item) => Boolean(item.id))
    : [];

  if ((Array.isArray(payload.attachments) && payload.attachments.length > 0) || eventAttachments.length > 0) {
    try {
      attachments = await persistResendSupportAttachments({
        ticketId: ticket.id,
        emailId,
        attachments:
          eventAttachments.length > 0
            ? eventAttachments
            : (payload.attachments || [])
                .map((item) => ({
                  id: String(item.id || "").trim(),
                  filename: item.filename,
                  contentType: item.contentType,
                }))
                .filter((item) => Boolean(item.id)),
      });
    } catch (error: any) {
      log("error", "support_webhook_attachment_fetch_failed", {
        emailId,
        ticketId: ticket.id,
        error: error?.message || "support_attachment_fetch_failed",
      });
      return NextResponse.json({ error: "Failed to retrieve inbound support attachments." }, { status: 502 });
    }
  }

  try {
    const created = await createSupportMessage({
      ticketId: ticket.id,
      senderType: "SUBSCRIBER",
      senderId: ticket.subscriberId,
      channel: "EMAIL",
      content: bodyText,
      attachments,
      messageIdHeader: threadHeaders.messageId || null,
      inReplyToHeader: threadHeaders.inReplyTo || null,
      referencesHeader: threadHeaders.references.length ? threadHeaders.references.join(" ") : null,
      deliveryStatus: "DELIVERED",
      workspaceId: ticket.workspaceId,
    });
    if (!created) {
      return NextResponse.json({ error: "Support ticket not found." }, { status: 404 });
    }
    if ("duplicate" in created && created.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true, ticketId: ticket.id });
    }

    await prisma.auditLog.create({
      data: {
        userId: ticket.subscriberId,
        orgId: ticket.workspaceId,
        action: "SUPPORT_EMAIL_REPLY_RECEIVED",
        actionType: "SUPPORT_EMAIL_REPLY_RECEIVED",
        metadata: {
          ticketId: ticket.id,
          messageId: created.id,
          provider: "resend",
          from,
        },
      },
    });

    await maybeForwardHumanMailboxCopy({
      ticketId: ticket.id,
      subject: payload.subject || "",
      from,
      text: bodyText,
    });

    log("info", "support_webhook_stored", {
      emailId,
      ticketId: ticket.id,
      messageId: created.id,
      from,
    });
    return NextResponse.json({ ok: true, ticketId: ticket.id, messageId: created.id });
  } catch (error: any) {
    log("error", "support_webhook_store_failed", {
      emailId,
      ticketId: ticket.id,
      error: error?.message || "support_inbound_store_failed",
    });
    await logChannelFailure({
      tenantId: ticket.workspaceId,
      actionType: "support.webhook.failure",
      metadata: {
        provider: "resend",
        scope: "support",
        ticketId: ticket.id,
        error: error?.message || "support_inbound_store_failed",
      },
    });
    return NextResponse.json({ error: "Failed to store inbound support email." }, { status: 500 });
  }
}
