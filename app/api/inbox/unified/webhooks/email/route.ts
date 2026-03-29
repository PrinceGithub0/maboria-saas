import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import {
  applyUnifiedInboundActivity,
  ensureUnifiedConversationParticipants,
} from "@/lib/inbox/conversation-participants";
import {
  createOrResolveCustomerForInbound,
  extractInboxRouteFromInboundAddress,
  decryptInboxCredentials,
  extractInboundReplyText,
  extractConversationIdFromEmailSubject,
  logChannelFailure,
  parseEmailThreadHeaders,
  parseSenderEmail,
} from "@/lib/inbox/channels";
import { emitUnifiedInboxEvent } from "@/lib/inbox/events";
import { ensureDefaultUnifiedInboxes, writeUnifiedAuditEvent } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { requireSystemFlag } from "@/lib/system-flags-guard";

type InboundPayload = {
  to?: string | string[];
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; contentType?: string; sizeBytes?: number; storageKey?: string }>;
};

type ResendInboundWebhookEvent = {
  type?: string;
  data?: {
    email_id?: string;
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

function safeTokenCompare(expected: string, actual: string) {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isAuthorized(req: Request) {
  const expected = process.env.INBOX_INBOUND_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("x-inbox-inbound-token") || "";
  return safeTokenCompare(expected, header);
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

function normalizeResendEmail(email: ResendReceivedEmail): InboundPayload {
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
            filename: String(attachment.filename),
            contentType: attachment.content_type || undefined,
          }))
      : undefined,
  };
}

function normalizeRecipients(input: string | string[] | undefined) {
  if (!input) return [];
  return Array.isArray(input) ? input.map((item) => String(item || "").trim()).filter(Boolean) : [String(input || "").trim()];
}

function extractRecipientEmails(input: string[]) {
  return input
    .map((value) => parseSenderEmail(value) || String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: Request) {
  const ingestDisabled = await requireSystemFlag(
    "webhooks_ingest_enabled",
    "Webhook ingest is currently disabled."
  );
  if (ingestDisabled) return ingestDisabled;

  const rawBody = await req.text();
  let payload: InboundPayload;
  let provider = "email";
  const tenantHeaderHint = req.headers.get("x-tenant-id") || "";

  if (isAuthorized(req)) {
    payload = JSON.parse(rawBody || "{}") as InboundPayload;
  } else {
    const verification = verifyResendWebhook(rawBody, req.headers);
    if (!verification.ok) {
      return NextResponse.json({ error: verification.error }, { status: verification.status });
    }
    if (verification.event.type !== "email.received") {
      return NextResponse.json({ ok: true, ignored: verification.event.type || "unknown_event" });
    }
    const emailId = String(verification.event.data?.email_id || "").trim();
    if (!emailId) {
      return NextResponse.json({ error: "Resend email id missing." }, { status: 422 });
    }
    try {
      payload = normalizeResendEmail(await fetchResendReceivedEmail(emailId));
      provider = "resend";
    } catch (error: any) {
      return NextResponse.json(
        { error: error?.message || "Failed to retrieve inbound email from Resend." },
        { status: 502 }
      );
    }
  }

  const recipients = normalizeRecipients(payload.to);
  const inboxRoute = extractInboxRouteFromInboundAddress(recipients);
  const tenantHint = tenantHeaderHint || inboxRoute?.tenantId || null;

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

  if (!tenantHint) {
    return NextResponse.json({ error: "Tenant route missing." }, { status: 422 });
  }

  const tenant = await prisma.business.findUnique({
    where: { id: String(tenantHint) },
    select: { id: true, ownerId: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }
  assertRateLimit(`unified-email-webhook:${tenant.id}`, parseWebhookRateLimit(), 60_000);

  const from = parseSenderEmail(String(payload.from || ""));
  if (!from) {
    return NextResponse.json({ error: "Sender email missing." }, { status: 422 });
  }
  const bodyText = extractInboundReplyText({
    text: payload.text,
    html: payload.html,
  });
  if (!bodyText) {
    return NextResponse.json({ error: "Message content missing." }, { status: 422 });
  }

  await ensureDefaultUnifiedInboxes(tenant.id);
  const emailInboxes = await prisma.unifiedInbox.findMany({
    where: {
      tenantId: tenant.id,
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

  const mailboxIds = emailInboxes
    .map((item) => String(decryptInboxCredentials(item.credentialsEncrypted).emailOAuth?.connectedMailboxId || "").trim())
    .filter(Boolean);
  const connectedMailboxes =
    mailboxIds.length > 0
      ? await prisma.connectedMailbox.findMany({
          where: {
            workspaceId: tenant.id,
            id: { in: mailboxIds },
          },
          select: {
            id: true,
            emailAddress: true,
          },
        })
      : [];
  const mailboxById = new Map(
    connectedMailboxes.map((mailbox) => [mailbox.id, mailbox.emailAddress.toLowerCase()])
  );
  const recipientEmails = extractRecipientEmails(recipients);

  let conversationId =
    String(inboxRoute?.conversationId || "").trim() ||
    extractConversationIdFromEmailSubject(String(payload.subject || "").trim() || "");
  let inboxId: string | null = null;
  if (conversationId) {
    const matchedConversation = await prisma.unifiedConversation.findFirst({
      where: {
        id: conversationId,
        tenantId: tenant.id,
      },
      select: {
        id: true,
        inboxId: true,
      },
    });
    conversationId = matchedConversation?.id || null;
    inboxId = matchedConversation?.inboxId || null;
  }
  if (!conversationId && (threadHeaders.inReplyTo || threadHeaders.references.length)) {
    const related = await prisma.unifiedMessage.findFirst({
      where: {
        tenantId: tenant.id,
        externalId: {
          in: [threadHeaders.inReplyTo, ...threadHeaders.references].filter(Boolean) as string[],
        },
      },
      select: {
        conversationId: true,
        inboxId: true,
      },
    });
    conversationId = related?.conversationId || null;
    inboxId = related?.inboxId || null;
  }

  const inbox =
    (inboxId ? emailInboxes.find((item) => item.id === inboxId) : null) ||
    emailInboxes.find((item) => {
      const credentials = decryptInboxCredentials(item.credentialsEncrypted);
      const mailboxId = String(credentials.emailOAuth?.connectedMailboxId || "").trim();
      const smtpCandidates = [
        String(credentials.email?.from || "").trim().toLowerCase(),
        String(credentials.email?.username || "").trim().toLowerCase(),
      ].filter(Boolean);
      const oauthCandidate = mailboxId ? mailboxById.get(mailboxId) || "" : "";
      return recipientEmails.some(
        (email) => email === oauthCandidate || smtpCandidates.includes(email)
      );
    }) ||
    emailInboxes.find((item) => item.status === "ACTIVE") ||
    emailInboxes[0] ||
    null;

  if (!inbox) {
    return NextResponse.json({ error: "Email inbox not configured." }, { status: 422 });
  }

  const customer = await createOrResolveCustomerForInbound({
    tenantId: tenant.id,
    ownerId: tenant.ownerId,
    channel: "EMAIL",
    email: from,
    displayName: from.split("@")[0],
  });

  let conversation =
    conversationId
      ? await prisma.unifiedConversation.findFirst({
          where: { id: conversationId, tenantId: tenant.id, inboxId: inbox.id },
          select: { id: true },
        })
      : null;

  if (!conversation) {
    conversation = await prisma.unifiedConversation.create({
      data: {
        tenantId: tenant.id,
        inboxId: inbox.id,
        contactId: customer.id,
        status: "OPEN",
      },
      select: { id: true },
    });

    await ensureUnifiedConversationParticipants(prisma, {
      tenantId: tenant.id,
      conversationId: conversation.id,
    });
  }

  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments.map((item) => ({
        filename: item.filename,
        contentType: item.contentType,
        sizeBytes: item.sizeBytes,
        storageKey: item.storageKey,
      }))
    : [];

  try {
    let createdMessageId: string | null = null;
    await prisma.$transaction(async (tx) => {
      const created = await tx.unifiedMessage.create({
        data: {
          tenantId: tenant.id,
          conversationId: conversation!.id,
          inboxId: inbox.id,
          direction: "INBOUND",
          channel: "EMAIL",
          externalId: threadHeaders.messageId || null,
          senderIdentifier: from,
          content: bodyText,
          attachments,
          deliveryStatus: "DELIVERED",
        },
      });

      await applyUnifiedInboundActivity(tx, {
        tenantId: tenant.id,
        conversationId: conversation!.id,
        occurredAt: created.createdAt,
      });

      await writeUnifiedAuditEvent(tx, {
        tenantId: tenant.id,
        actionType: "inbound.received",
        conversationId: conversation!.id,
        messageId: created.id,
        metadata: {
          provider,
          from,
          subject: payload.subject,
          messageId: threadHeaders.messageId,
          inReplyTo: threadHeaders.inReplyTo,
        },
      });
      createdMessageId = created.id;
    });
    if (createdMessageId) {
      await emitUnifiedInboxEvent({
        tenantId: tenant.id,
        type: "message.received",
        conversationId: conversation.id,
        metadata: {
          provider,
          messageId: createdMessageId,
          externalId: threadHeaders.messageId,
        },
      });
    }
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    await logChannelFailure({
      tenantId: tenant.id,
      actionType: "webhook.failure",
      metadata: {
        provider,
        error: error?.message || "inbound_store_failed",
      },
    });
    return NextResponse.json({ error: "Failed to store inbound email." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, conversationId: conversation.id });
}
