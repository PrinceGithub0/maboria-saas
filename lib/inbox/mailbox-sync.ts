import "server-only";

import { Prisma } from "@prisma/client";
import {
  applyUnifiedInboundActivity,
  ensureUnifiedConversationParticipants,
} from "@/lib/inbox/conversation-participants";
import {
  createOrResolveCustomerForInbound,
  decryptInboxCredentials,
  extractConversationIdFromEmailSubject,
  extractInboxRouteFromInboundAddress,
  extractInboundReplyText,
  getConnectedMailboxAccess,
  logChannelFailure,
  parseConnectedMailboxMetadata,
  parseEmailThreadHeaders,
  parseSenderEmail,
} from "@/lib/inbox/channels";
import { emitUnifiedInboxEvent } from "@/lib/inbox/events";
import { writeUnifiedAuditEvent } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

const MAILBOX_SYNC_COOLDOWN_MS = 25_000;
const MAILBOX_SYNC_FETCH_LIMIT = 25;
const MAILBOX_SYNC_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const MAILBOX_SYNC_CONTACT_FALLBACK_MS = 30 * 24 * 60 * 60 * 1000;

type MailboxSyncSummary = {
  checked: number;
  imported: number;
  duplicates: number;
  conversationsCreated: number;
  skipped: number;
  failures: number;
};

type MailboxThreadHeaders = {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
};

type NormalizedInboundMailboxMessage = {
  provider: "GMAIL" | "OUTLOOK";
  providerMessageId: string;
  providerThreadId: string | null;
  externalId: string;
  subject: string;
  fromEmail: string | null;
  fromName: string | null;
  recipientAddresses: string[];
  text: string;
  html: string | null;
  receivedAt: Date;
  threadHeaders: MailboxThreadHeaders;
};

type MailboxSyncState = {
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  latestReceivedAt?: string;
  lastError?: string | null;
  lastErrorAt?: string | null;
};

type MailboxBinding = {
  inboxId: string;
  tenantId: string;
  inboxName: string;
  mailboxId: string;
};

class MailboxSyncError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "mailbox_sync_failed") {
    super(message);
    this.name = "MailboxSyncError";
    this.status = status;
    this.code = code;
  }
}

function decodeBase64Url(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const padded = normalized.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function extractSenderName(value: string | null | undefined, fallbackEmail?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const angleMatch = raw.match(/^(.*?)<[^>]+>/);
  const candidate = (angleMatch?.[1] || raw).replace(/^["']+|["']+$/g, "").trim();
  if (!candidate) return null;
  if (fallbackEmail && candidate.toLowerCase() === String(fallbackEmail || "").toLowerCase()) return null;
  return candidate;
}

function splitHeaderAddresses(value: string | null | undefined) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanInternetMessageId(value: string | null | undefined) {
  return String(value || "").replace(/[<>]/g, "").trim() || null;
}

function findHeaderValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string
) {
  return (
    headers?.find((header) => String(header?.name || "").toLowerCase() === name.toLowerCase())?.value?.trim() ||
    null
  );
}

function collectGmailBodyParts(
  node: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: any[] | null } | null | undefined,
  target: { text: string[]; html: string[] }
) {
  if (!node) return;
  const mimeType = String(node.mimeType || "").toLowerCase();
  const body = decodeBase64Url(node.body?.data);
  if (body) {
    if (mimeType === "text/plain") {
      target.text.push(body);
    } else if (mimeType === "text/html") {
      target.html.push(body);
    }
  }

  const parts = Array.isArray(node.parts) ? node.parts : [];
  for (const part of parts) {
    collectGmailBodyParts(part, target);
  }
}

function parseMailboxSyncState(metadata: Prisma.JsonValue | null | undefined) {
  const parsed = parseConnectedMailboxMetadata(metadata);
  const raw = parsed.unifiedInboxSync;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {} as MailboxSyncState;
  }
  return raw as MailboxSyncState;
}

function mergeMailboxSyncState(
  metadata: Prisma.JsonValue | null | undefined,
  syncState: MailboxSyncState
) {
  return {
    ...parseConnectedMailboxMetadata(metadata),
    unifiedInboxSync: syncState,
  } satisfies Record<string, unknown>;
}

function getMailboxSyncCursorDate(syncState: MailboxSyncState) {
  const value = Date.parse(String(syncState.latestReceivedAt || ""));
  if (Number.isFinite(value)) return new Date(value);
  return new Date(Date.now() - MAILBOX_SYNC_LOOKBACK_MS);
}

function shouldSkipMailboxSync(syncState: MailboxSyncState, now: number) {
  const lastAttempt = Date.parse(String(syncState.lastAttemptAt || ""));
  return Number.isFinite(lastAttempt) && now - lastAttempt < MAILBOX_SYNC_COOLDOWN_MS;
}

async function updateMailboxSyncState(input: {
  mailboxId: string;
  metadata: Prisma.JsonValue | null | undefined;
  syncState: MailboxSyncState;
}) {
  await prisma.connectedMailbox.update({
    where: { id: input.mailboxId },
    data: {
      metadata: mergeMailboxSyncState(input.metadata, input.syncState) as Prisma.InputJsonValue,
    },
  });
}

async function fetchGmailInboundMessages(input: {
  accessToken: string;
  since: Date;
}) {
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("labelIds", "INBOX");
  listUrl.searchParams.set("maxResults", String(MAILBOX_SYNC_FETCH_LIMIT));

  const listResponse = await fetch(listUrl, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    cache: "no-store",
  });
  const listPayload = await listResponse.json().catch(() => ({}));
  if (!listResponse.ok) {
    throw new MailboxSyncError(
      String(listPayload?.error?.message || "Failed to list Gmail inbox messages."),
      listResponse.status,
      "gmail_inbox_list_failed"
    );
  }

  const messages = Array.isArray(listPayload?.messages) ? listPayload.messages : [];
  const results: NormalizedInboundMailboxMessage[] = [];

  for (const message of messages) {
    const messageId = String(message?.id || "").trim();
    if (!messageId) continue;

    const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`);
    detailUrl.searchParams.set("format", "full");

    const detailResponse = await fetch(detailUrl, {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
      cache: "no-store",
    });
    const detailPayload = await detailResponse.json().catch(() => ({}));
    if (!detailResponse.ok) {
      throw new MailboxSyncError(
        String(detailPayload?.error?.message || "Failed to fetch Gmail message."),
        detailResponse.status,
        "gmail_message_fetch_failed"
      );
    }

    const receivedAt = new Date(Number(detailPayload?.internalDate || 0));
    if (!Number.isFinite(receivedAt.getTime()) || receivedAt <= input.since) continue;

    const headers = Array.isArray(detailPayload?.payload?.headers) ? detailPayload.payload.headers : [];
    const rawFrom = findHeaderValue(headers, "From");
    const fromEmail = parseSenderEmail(rawFrom || "");
    const recipientAddresses = [
      ...splitHeaderAddresses(findHeaderValue(headers, "To")),
      ...splitHeaderAddresses(findHeaderValue(headers, "Cc")),
      ...splitHeaderAddresses(findHeaderValue(headers, "Delivered-To")),
    ];
    const bodyParts = { text: [] as string[], html: [] as string[] };
    collectGmailBodyParts(detailPayload?.payload, bodyParts);
    const rawText = bodyParts.text.join("\n\n").trim() || String(detailPayload?.snippet || "").trim();
    const rawHtml = bodyParts.html.join("\n\n").trim() || null;
    const content = extractInboundReplyText({
      text: rawText || null,
      html: rawHtml,
    });

    if (!fromEmail || !content) continue;

    const threadHeaders = parseEmailThreadHeaders({
      messageId: cleanInternetMessageId(findHeaderValue(headers, "Message-ID")) || messageId,
      inReplyTo: cleanInternetMessageId(findHeaderValue(headers, "In-Reply-To")),
      references: findHeaderValue(headers, "References"),
    });

    results.push({
      provider: "GMAIL",
      providerMessageId: messageId,
      providerThreadId: String(detailPayload?.threadId || "").trim() || null,
      externalId: threadHeaders.messageId || messageId,
      subject: String(findHeaderValue(headers, "Subject") || "").trim(),
      fromEmail,
      fromName: extractSenderName(rawFrom, fromEmail),
      recipientAddresses,
      text: content,
      html: rawHtml,
      receivedAt,
      threadHeaders,
    });
  }

  return results.sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime());
}

async function fetchOutlookInboundMessages(input: {
  accessToken: string;
  since: Date;
}) {
  const requestUrl = new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages");
  requestUrl.searchParams.set(
    "$select",
    [
      "id",
      "internetMessageId",
      "subject",
      "receivedDateTime",
      "conversationId",
      "body",
      "bodyPreview",
      "from",
      "toRecipients",
      "ccRecipients",
      "internetMessageHeaders",
    ].join(",")
  );
  requestUrl.searchParams.set("$orderby", "receivedDateTime desc");
  requestUrl.searchParams.set("$top", String(MAILBOX_SYNC_FETCH_LIMIT));

  const response = await fetch(requestUrl, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Prefer: 'outlook.body-content-type="text"',
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new MailboxSyncError(
      String(payload?.error?.message || "Failed to list Outlook inbox messages."),
      response.status,
      "outlook_inbox_list_failed"
    );
  }

  const items = Array.isArray(payload?.value) ? payload.value : [];
  const results: NormalizedInboundMailboxMessage[] = [];

  for (const item of items) {
    const receivedAt = new Date(String(item?.receivedDateTime || ""));
    if (!Number.isFinite(receivedAt.getTime()) || receivedAt <= input.since) continue;

    const fromEmail = String(item?.from?.emailAddress?.address || "").trim().toLowerCase() || null;
    const rawText =
      item?.body?.contentType === "text"
        ? String(item?.body?.content || "")
        : String(item?.bodyPreview || "");
    const rawHtml = item?.body?.contentType === "html" ? String(item?.body?.content || "") : null;
    const content = extractInboundReplyText({
      text: rawText || null,
      html: rawHtml,
    });

    if (!fromEmail || !content) continue;

    const headers = Array.isArray(item?.internetMessageHeaders) ? item.internetMessageHeaders : [];
    const threadHeaders = parseEmailThreadHeaders({
      messageId: cleanInternetMessageId(item?.internetMessageId) || String(item?.id || "").trim(),
      inReplyTo: cleanInternetMessageId(findHeaderValue(headers, "In-Reply-To")),
      references: findHeaderValue(headers, "References"),
    });

    results.push({
      provider: "OUTLOOK",
      providerMessageId: String(item?.id || "").trim(),
      providerThreadId: String(item?.conversationId || "").trim() || null,
      externalId: threadHeaders.messageId || String(item?.id || "").trim(),
      subject: String(item?.subject || "").trim(),
      fromEmail,
      fromName: String(item?.from?.emailAddress?.name || "").trim() || null,
      recipientAddresses: [
        ...splitHeaderAddresses(findHeaderValue(headers, "To")),
        ...splitHeaderAddresses(findHeaderValue(headers, "Cc")),
        ...splitHeaderAddresses(findHeaderValue(headers, "Delivered-To")),
        ...(Array.isArray(item?.toRecipients)
          ? item.toRecipients
              .map((entry: any) => String(entry?.emailAddress?.address || "").trim())
              .filter(Boolean)
          : []),
        ...(Array.isArray(item?.ccRecipients)
          ? item.ccRecipients
              .map((entry: any) => String(entry?.emailAddress?.address || "").trim())
              .filter(Boolean)
          : []),
      ],
      text: content,
      html: rawHtml,
      receivedAt,
      threadHeaders,
    });
  }

  return results.sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime());
}

async function resolveConversation(input: {
  tenantId: string;
  inboxId: string;
  contactId: string;
  subject: string;
  providerThreadId: string | null;
  recipientAddresses: string[];
  threadHeaders: MailboxThreadHeaders;
}) {
  const routedConversationId = extractInboxRouteFromInboundAddress(input.recipientAddresses)?.conversationId;
  if (routedConversationId) {
    const conversation = await prisma.unifiedConversation.findFirst({
      where: {
        id: routedConversationId,
        tenantId: input.tenantId,
        inboxId: input.inboxId,
      },
      select: { id: true },
    });
    if (conversation) return conversation;
  }

  const subjectConversationId = extractConversationIdFromEmailSubject(input.subject);
  if (subjectConversationId) {
    const conversation = await prisma.unifiedConversation.findFirst({
      where: {
        id: subjectConversationId,
        tenantId: input.tenantId,
        inboxId: input.inboxId,
      },
      select: { id: true },
    });
    if (conversation) return conversation;
  }

  if (input.providerThreadId) {
    const recentOutboundEvents = await prisma.unifiedAuditEvent.findMany({
      where: {
        tenantId: input.tenantId,
        actionType: "outbound.sent",
        createdAt: {
          gte: new Date(Date.now() - MAILBOX_SYNC_CONTACT_FALLBACK_MS),
        },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        conversationId: true,
        metadata: true,
      },
    });

    const matchingEvent = recentOutboundEvents.find((event) => {
      if (!event.conversationId) return false;
      const metadata =
        event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
          ? (event.metadata as Record<string, unknown>)
          : null;
      return (
        String(metadata?.providerThreadId || "").trim() === input.providerThreadId &&
        String(metadata?.channel || "").trim() === "EMAIL"
      );
    });

    if (matchingEvent?.conversationId) {
      const conversation = await prisma.unifiedConversation.findFirst({
        where: {
          id: matchingEvent.conversationId,
          tenantId: input.tenantId,
          inboxId: input.inboxId,
        },
        select: { id: true },
      });
      if (conversation) return conversation;
    }
  }

  const relatedExternalIds = [input.threadHeaders.inReplyTo, ...input.threadHeaders.references].filter(Boolean) as string[];
  if (relatedExternalIds.length) {
    const related = await prisma.unifiedMessage.findFirst({
      where: {
        tenantId: input.tenantId,
        inboxId: input.inboxId,
        externalId: { in: relatedExternalIds },
      },
      orderBy: { createdAt: "desc" },
      select: { conversationId: true },
    });
    if (related?.conversationId) {
      return { id: related.conversationId };
    }
  }

  const recentConversation = await prisma.unifiedConversation.findFirst({
    where: {
      tenantId: input.tenantId,
      inboxId: input.inboxId,
      contactId: input.contactId,
      lastOutboundAt: {
        gte: new Date(Date.now() - MAILBOX_SYNC_CONTACT_FALLBACK_MS),
      },
    },
    orderBy: [{ lastOutboundAt: "desc" }, { updatedAt: "desc" }],
    select: { id: true },
  });
  if (recentConversation) {
    return recentConversation;
  }

  return null;
}

async function importInboundMailboxMessage(input: {
  tenantId: string;
  ownerUserId: string;
  inboxId: string;
  message: NormalizedInboundMailboxMessage;
}) {
  const customer = await createOrResolveCustomerForInbound({
    tenantId: input.tenantId,
    ownerId: input.ownerUserId,
    channel: "EMAIL",
    email: input.message.fromEmail,
    displayName: input.message.fromName || input.message.fromEmail?.split("@")[0] || null,
  });

  const existingConversation = await resolveConversation({
    tenantId: input.tenantId,
    inboxId: input.inboxId,
    contactId: customer.id,
    subject: input.message.subject,
    providerThreadId: input.message.providerThreadId,
    recipientAddresses: input.message.recipientAddresses,
    threadHeaders: input.message.threadHeaders,
  });

  let createdConversation = false;
  let createdMessageId: string | null = null;
  let conversationId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const conversation =
      existingConversation ||
      (await tx.unifiedConversation.create({
        data: {
          tenantId: input.tenantId,
          inboxId: input.inboxId,
          contactId: customer.id,
          status: "OPEN",
          createdAt: input.message.receivedAt,
        },
        select: { id: true },
      }));

    if (!existingConversation) {
      createdConversation = true;
      await ensureUnifiedConversationParticipants(tx, {
        tenantId: input.tenantId,
        conversationId: conversation.id,
      });
      await writeUnifiedAuditEvent(tx, {
        tenantId: input.tenantId,
        actionType: "conversation.created",
        conversationId: conversation.id,
        metadata: {
          source: "mailbox_sync",
          inboxId: input.inboxId,
          contactId: customer.id,
        },
      });
    }

    const createdMessage = await tx.unifiedMessage.create({
      data: {
        tenantId: input.tenantId,
        conversationId: conversation.id,
        inboxId: input.inboxId,
        direction: "INBOUND",
        channel: "EMAIL",
        externalId: input.message.externalId,
        senderIdentifier: input.message.fromEmail,
        content: input.message.text,
        deliveryStatus: "DELIVERED",
        createdAt: input.message.receivedAt,
      },
    });

    await applyUnifiedInboundActivity(tx, {
      tenantId: input.tenantId,
      conversationId: conversation.id,
      occurredAt: input.message.receivedAt,
    });

    await writeUnifiedAuditEvent(tx, {
      tenantId: input.tenantId,
      actionType: "inbound.received",
      conversationId: conversation.id,
      messageId: createdMessage.id,
      metadata: {
        provider: input.message.provider,
        source: "mailbox_sync",
        providerMessageId: input.message.providerMessageId,
        externalId: input.message.externalId,
        subject: input.message.subject,
        inReplyTo: input.message.threadHeaders.inReplyTo,
      },
    });

    createdMessageId = createdMessage.id;
    conversationId = conversation.id;
  });

  if (createdMessageId && conversationId) {
    await emitUnifiedInboxEvent({
      tenantId: input.tenantId,
      type: "message.received",
      conversationId,
      metadata: {
        source: "mailbox_sync",
        messageId: createdMessageId,
        provider: input.message.provider,
      },
    });
  }

  return {
    imported: 1,
    duplicates: 0,
    conversationsCreated: createdConversation ? 1 : 0,
  } satisfies Pick<MailboxSyncSummary, "imported" | "duplicates" | "conversationsCreated">;
}

async function syncSingleMailbox(input: {
  binding: MailboxBinding;
  ownerUserId: string;
  force?: boolean;
}) {
  const now = new Date();
  let providerHint: string | null = null;

  try {
    const access = await getConnectedMailboxAccess({ mailboxId: input.binding.mailboxId });
    if (!access?.accessToken || access.mailbox.status !== "ACTIVE") {
      return {
        checked: 0,
        imported: 0,
        duplicates: 0,
        conversationsCreated: 0,
        skipped: 1,
        failures: 0,
      } satisfies MailboxSyncSummary;
    }

    providerHint = access.mailbox.provider;
    const syncState = parseMailboxSyncState(access.mailbox.metadata);
    if (!input.force && shouldSkipMailboxSync(syncState, now.getTime())) {
      return {
        checked: 0,
        imported: 0,
        duplicates: 0,
        conversationsCreated: 0,
        skipped: 1,
        failures: 0,
      } satisfies MailboxSyncSummary;
    }

    await updateMailboxSyncState({
      mailboxId: access.mailbox.id,
      metadata: access.mailbox.metadata,
      syncState: {
        ...syncState,
        lastAttemptAt: now.toISOString(),
      },
    });

    const since = getMailboxSyncCursorDate(syncState);
    const messages =
      access.mailbox.provider === "GMAIL"
        ? await fetchGmailInboundMessages({
            accessToken: access.accessToken,
            since,
          })
        : await fetchOutlookInboundMessages({
            accessToken: access.accessToken,
            since,
          });

    const summary: MailboxSyncSummary = {
      checked: messages.length,
      imported: 0,
      duplicates: 0,
      conversationsCreated: 0,
      skipped: 0,
      failures: 0,
    };

    let latestReceivedAt = syncState.latestReceivedAt || null;

    for (const message of messages) {
      latestReceivedAt =
        !latestReceivedAt || new Date(latestReceivedAt).getTime() < message.receivedAt.getTime()
          ? message.receivedAt.toISOString()
          : latestReceivedAt;

      try {
        const result = await importInboundMailboxMessage({
          tenantId: input.binding.tenantId,
          ownerUserId: input.ownerUserId,
          inboxId: input.binding.inboxId,
          message,
        });
        summary.imported += result.imported;
        summary.duplicates += result.duplicates;
        summary.conversationsCreated += result.conversationsCreated;
      } catch (error: any) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          summary.duplicates += 1;
          continue;
        }
        throw error;
      }
    }

    await updateMailboxSyncState({
      mailboxId: access.mailbox.id,
      metadata: access.mailbox.metadata,
      syncState: {
        ...syncState,
        lastAttemptAt: now.toISOString(),
        lastSuccessAt: new Date().toISOString(),
        latestReceivedAt: latestReceivedAt || syncState.latestReceivedAt,
        lastError: null,
        lastErrorAt: null,
      },
    });

    return summary;
  } catch (error: any) {
    const mailbox = await prisma.connectedMailbox
      .findUnique({
        where: { id: input.binding.mailboxId },
        select: {
          id: true,
          metadata: true,
          provider: true,
        },
      })
      .catch(() => null);

    if (mailbox) {
      providerHint = providerHint || mailbox.provider;
      const syncState = parseMailboxSyncState(mailbox.metadata);
      await updateMailboxSyncState({
        mailboxId: mailbox.id,
        metadata: mailbox.metadata,
        syncState: {
          ...syncState,
          lastAttemptAt: now.toISOString(),
          lastError: String(error?.message || "Mailbox sync failed."),
          lastErrorAt: now.toISOString(),
        },
      }).catch(() => undefined);
    }

    await logChannelFailure({
      tenantId: input.binding.tenantId,
      actionType: "mailbox.sync_failed",
      metadata: {
        inboxId: input.binding.inboxId,
        mailboxId: input.binding.mailboxId,
        provider: providerHint,
        error: String(error?.message || "Mailbox sync failed."),
      },
    });

    return {
      checked: 0,
      imported: 0,
      duplicates: 0,
      conversationsCreated: 0,
      skipped: 0,
      failures: 1,
    } satisfies MailboxSyncSummary;
  }
}

export async function syncUnifiedInboxMailboxReplies(input: {
  tenantId: string;
  ownerUserId: string;
  force?: boolean;
}) {
  const emailInboxes = await prisma.unifiedInbox.findMany({
    where: {
      tenantId: input.tenantId,
      type: "EMAIL",
      status: "ACTIVE",
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      tenantId: true,
      name: true,
      credentialsEncrypted: true,
    },
  });

  const bindings: MailboxBinding[] = emailInboxes
    .map((inbox) => {
      const mailboxId = String(decryptInboxCredentials(inbox.credentialsEncrypted).emailOAuth?.connectedMailboxId || "").trim();
      if (!mailboxId) return null;
      return {
        inboxId: inbox.id,
        tenantId: inbox.tenantId,
        inboxName: inbox.name,
        mailboxId,
      } satisfies MailboxBinding;
    })
    .filter((value): value is MailboxBinding => Boolean(value));

  const totals: MailboxSyncSummary = {
    checked: 0,
    imported: 0,
    duplicates: 0,
    conversationsCreated: 0,
    skipped: 0,
    failures: 0,
  };

  for (const binding of bindings) {
    const summary = await syncSingleMailbox({
      binding,
      ownerUserId: input.ownerUserId,
      force: input.force,
    });
    totals.checked += summary.checked;
    totals.imported += summary.imported;
    totals.duplicates += summary.duplicates;
    totals.conversationsCreated += summary.conversationsCreated;
    totals.skipped += summary.skipped;
    totals.failures += summary.failures;
  }

  return {
    mailboxCount: bindings.length,
    ...totals,
  };
}
