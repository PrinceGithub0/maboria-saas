import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  applyUnifiedInboundActivity,
  ensureUnifiedConversationParticipants,
} from "@/lib/inbox/conversation-participants";
import {
  createOrResolveCustomerForInbound,
  extractInboundReplyText,
  extractConversationIdFromEmailSubject,
  extractTenantIdFromInboundAddress,
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

function normalizeRecipients(input: string | string[] | undefined) {
  if (!input) return [];
  return Array.isArray(input) ? input.map((item) => String(item || "").trim()).filter(Boolean) : [String(input || "").trim()];
}

export async function POST(req: Request) {
  const ingestDisabled = await requireSystemFlag(
    "webhooks_ingest_enabled",
    "Webhook ingest is currently disabled."
  );
  if (ingestDisabled) return ingestDisabled;

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await req.json().catch(() => ({}))) as InboundPayload;
  const provider = "email";

  const recipients = normalizeRecipients(payload.to);
  const tenantHint = req.headers.get("x-tenant-id") || extractTenantIdFromInboundAddress(recipients);

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

  const { email: inbox } = await ensureDefaultUnifiedInboxes(tenant.id);
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

  let conversationId = extractConversationIdFromEmailSubject(String(payload.subject || "").trim() || "");
  if (!conversationId && (threadHeaders.inReplyTo || threadHeaders.references.length)) {
    const related = await prisma.unifiedMessage.findFirst({
      where: {
        tenantId: tenant.id,
        inboxId: inbox.id,
        externalId: {
          in: [threadHeaders.inReplyTo, ...threadHeaders.references].filter(Boolean) as string[],
        },
      },
      select: { conversationId: true },
    });
    conversationId = related?.conversationId || null;
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
