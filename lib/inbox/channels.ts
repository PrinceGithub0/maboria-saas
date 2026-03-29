import "server-only";

import crypto from "crypto";
import nodemailer from "nodemailer";
import { Prisma, UnifiedInbox, UnifiedMessageChannel } from "@prisma/client";
import { encryptInboxSecret, safeDecryptInboxSecret } from "@/lib/crypto";
import { enforceUsageLimit } from "@/lib/entitlements";
import { log } from "@/lib/logger";
import { sanitizeInboundEmailDisplayText } from "@/lib/inbox/message-format";
import {
  isOauthMailboxProvider,
  normalizeMailboxAttachments,
  refreshMailboxOauthToken,
  sendOauthMailboxEmail,
} from "@/lib/mailboxes/oauth";
import { prisma } from "@/lib/prisma";
import { billingPeriodKey, incrementUnifiedUsageCounter } from "@/lib/inbox/unified";

type DecryptedInboxCredentials = {
  email?: {
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    password?: string;
    from?: string;
  };
  emailOAuth?: {
    connectedMailboxId?: string;
  };
  whatsapp?: {
    accessToken?: string;
    phoneNumberId?: string;
    apiVersion?: string;
    appSecret?: string;
    verifyToken?: string;
    businessAccountId?: string | null;
    businessId?: string | null;
    displayPhoneNumber?: string | null;
    verifiedName?: string | null;
    qualityRating?: string | null;
  };
};

type OutboundChannelResult = {
  externalId: string | null;
  providerThreadId: string | null;
  deliveryStatus: "SENT" | "FAILED";
  errorCode: string | null;
  errorMessage: string | null;
};

type InboxCredentialCarrier = Pick<UnifiedInbox, "id" | "credentialsEncrypted" | "type">;

type OutboundEmailAttachment = {
  name?: string;
  type?: string;
  size?: number;
  dataUrl?: string;
};

export function decryptInboxCredentials(value: string | null | undefined): DecryptedInboxCredentials {
  if (!value) return {};
  try {
    const decrypted = safeDecryptInboxSecret(value);
    if (!decrypted) return {};
    const parsed = JSON.parse(decrypted);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function ensureOutboundQuota(input: {
  userId: string;
  tenantId: string;
  channel: UnifiedMessageChannel;
  orgPlan: string | null;
}) {
  if (input.channel === "WHATSAPP") {
    const quota = await enforceUsageLimit(input.userId, "whatsappMessages");
    if (!quota.ok) {
      return {
        ok: false as const,
        status: 402,
        error: "Upgrade required for WhatsApp usage.",
        details: {
          plan: quota.plan,
          used: quota.used,
          limit: quota.limit,
        },
      };
    }
    return { ok: true as const };
  }

  const planKey = String(input.orgPlan || "").toUpperCase();
  const monthKey = billingPeriodKey(new Date());
  const usage = await prisma.unifiedUsageCounter.findUnique({
    where: {
      tenantId_billingPeriod: {
        tenantId: input.tenantId,
        billingPeriod: monthKey,
      },
    },
    select: { emailMessagesSent: true },
  });

  const limit =
    planKey === "STARTER"
      ? 250
      : planKey === "PRO"
        ? 2000
        : planKey === "GROWTH"
          ? 6000
          : planKey === "BUSINESS" || planKey === "PREMIUM"
            ? 15000
            : planKey === "ENTERPRISE"
              ? null
              : 250;

  if (limit !== null && (usage?.emailMessagesSent ?? 0) >= limit) {
    return {
      ok: false as const,
      status: 402,
      error: "Email message limit reached for this billing period.",
      details: {
        plan: planKey || "STARTER",
        used: usage?.emailMessagesSent ?? 0,
        limit,
      },
    };
  }

  return { ok: true as const };
}

function resolveSmtpConfig(credentials: DecryptedInboxCredentials) {
  const port = Number(credentials.email?.port ?? 587);
  const secure = credentials.email?.secure ?? port === 465;
  return {
    host: credentials.email?.host || "",
    port,
    secure,
    user: credentials.email?.username || "",
    pass: credentials.email?.password || "",
    from: credentials.email?.from || credentials.email?.username || "",
  };
}

function resolveOauthMailboxBinding(credentials: DecryptedInboxCredentials) {
  return {
    connectedMailboxId: String(credentials.emailOAuth?.connectedMailboxId || "").trim(),
  };
}

export function parseConnectedMailboxMetadata(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}

function shouldRefreshMailboxAccessToken(metadata: Prisma.JsonValue | null | undefined) {
  const expiresAt = String(parseConnectedMailboxMetadata(metadata).expiresAt || "").trim();
  if (!expiresAt) return false;
  const value = Date.parse(expiresAt);
  if (!Number.isFinite(value)) return false;
  return value <= Date.now() + 60_000;
}

async function persistConnectedMailboxTokens(input: {
  mailboxId: string;
  accessToken: string;
  refreshToken: string | null;
  metadata: Record<string, unknown>;
}) {
  return prisma.connectedMailbox.update({
    where: { id: input.mailboxId },
    data: {
      accessTokenEncrypted: encryptInboxSecret(input.accessToken),
      refreshTokenEncrypted: input.refreshToken ? encryptInboxSecret(input.refreshToken) : null,
      metadata: input.metadata as Prisma.InputJsonValue,
      status: "ACTIVE",
    },
    select: {
      id: true,
      workspaceId: true,
      subscriberId: true,
      provider: true,
      status: true,
      emailAddress: true,
      displayName: true,
      accessTokenEncrypted: true,
      refreshTokenEncrypted: true,
      metadata: true,
    },
  });
}

async function markConnectedMailboxDisconnected(input: {
  mailboxId: string;
  metadata: Record<string, unknown>;
  reason: string;
}) {
  await prisma.connectedMailbox.update({
    where: { id: input.mailboxId },
    data: {
      status: "DISCONNECTED",
      metadata: {
        ...input.metadata,
        lastError: input.reason,
        lastErrorAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

async function refreshConnectedMailboxAccess(input: {
  mailbox: {
    id: string;
    provider: string;
    refreshTokenEncrypted: string | null;
    metadata: Prisma.JsonValue | null;
  };
}) {
  if (!isOauthMailboxProvider(input.mailbox.provider)) {
    throw new Error("Connected mailbox provider does not support OAuth refresh.");
  }

  const refreshToken = safeDecryptInboxSecret(input.mailbox.refreshTokenEncrypted);
  if (!refreshToken) {
    throw new Error("Mailbox refresh token is missing.");
  }

  const refreshed = await refreshMailboxOauthToken({
    provider: input.mailbox.provider,
    refreshToken,
    callbackUrl: `${process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/mailboxes/connected/oauth/callback`,
  });

  return persistConnectedMailboxTokens({
    mailboxId: input.mailbox.id,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    metadata: {
      ...parseConnectedMailboxMetadata(input.mailbox.metadata),
      scope: refreshed.scope,
      tokenType: refreshed.tokenType,
      expiresAt: refreshed.expiresAt,
      refreshedAt: new Date().toISOString(),
    },
  });
}

export async function getConnectedMailboxAccess(input: { mailboxId: string }) {
  const mailbox = await prisma.connectedMailbox.findUnique({
    where: { id: input.mailboxId },
    select: {
      id: true,
      workspaceId: true,
      subscriberId: true,
      provider: true,
      status: true,
      emailAddress: true,
      displayName: true,
      accessTokenEncrypted: true,
      refreshTokenEncrypted: true,
      metadata: true,
    },
  });

  if (!mailbox || !isOauthMailboxProvider(mailbox.provider)) {
    return null;
  }

  let activeMailbox = mailbox;
  let accessToken = safeDecryptInboxSecret(mailbox.accessTokenEncrypted);

  if ((!accessToken || shouldRefreshMailboxAccessToken(mailbox.metadata)) && mailbox.refreshTokenEncrypted) {
    activeMailbox = await refreshConnectedMailboxAccess({
      mailbox,
    });
    accessToken = safeDecryptInboxSecret(activeMailbox.accessTokenEncrypted);
  }

  return {
    mailbox: activeMailbox,
    accessToken: accessToken || null,
    metadata: parseConnectedMailboxMetadata(activeMailbox.metadata),
  };
}

export async function sendOutboundEmail(input: {
  inbox: InboxCredentialCarrier;
  conversationId: string;
  toEmail: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: OutboundEmailAttachment[];
}) {
  const credentials = decryptInboxCredentials(input.inbox.credentialsEncrypted);
  const oauthBinding = resolveOauthMailboxBinding(credentials);
  const text = input.text || htmlToText(input.html);
  if (oauthBinding.connectedMailboxId) {
    const mailbox = await prisma.connectedMailbox.findUnique({
      where: { id: oauthBinding.connectedMailboxId },
      select: {
        id: true,
        provider: true,
        status: true,
        emailAddress: true,
        displayName: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
        metadata: true,
      },
    });

    if (!mailbox || !isOauthMailboxProvider(mailbox.provider)) {
      return {
        externalId: null,
        providerThreadId: null,
        deliveryStatus: "FAILED",
        errorCode: "email_oauth_mailbox_missing",
        errorMessage: "Connected mailbox is not available.",
      } satisfies OutboundChannelResult;
    }

    if (mailbox.status !== "ACTIVE") {
      return {
        externalId: null,
        providerThreadId: null,
        deliveryStatus: "FAILED",
        errorCode: "email_oauth_mailbox_inactive",
        errorMessage: "Connected mailbox is not active.",
      } satisfies OutboundChannelResult;
    }

    try {
      let activeMailbox = mailbox;
      let accessToken = safeDecryptInboxSecret(mailbox.accessTokenEncrypted);
      if ((!accessToken || shouldRefreshMailboxAccessToken(mailbox.metadata)) && mailbox.refreshTokenEncrypted) {
        activeMailbox = await refreshConnectedMailboxAccess({
          mailbox,
        });
        accessToken = safeDecryptInboxSecret(activeMailbox.accessTokenEncrypted);
      }

      if (!accessToken) {
        return {
          externalId: null,
          providerThreadId: null,
          deliveryStatus: "FAILED",
          errorCode: "email_oauth_token_missing",
          errorMessage: "Connected mailbox access token is missing.",
        } satisfies OutboundChannelResult;
      }

      try {
        if (!isOauthMailboxProvider(activeMailbox.provider)) {
          throw new Error("Connected mailbox provider does not support OAuth send.");
        }
        const result = await sendOauthMailboxEmail({
          provider: activeMailbox.provider,
          accessToken,
          mailboxEmailAddress: activeMailbox.emailAddress,
          mailboxDisplayName: activeMailbox.displayName,
          toEmail: input.toEmail,
          subject: input.subject,
          html: input.html,
          text,
          replyTo: input.replyTo,
          headers: input.headers,
          attachments: input.attachments,
        });

        return {
          externalId: result.externalId,
          providerThreadId: result.providerThreadId || null,
          deliveryStatus: "SENT",
          errorCode: null,
          errorMessage: null,
        } satisfies OutboundChannelResult;
      } catch (error: any) {
        const shouldRetryWithRefresh =
          Number(error?.status || 0) === 401 && Boolean(activeMailbox.refreshTokenEncrypted);
        if (!shouldRetryWithRefresh) {
          throw error;
        }

        const refreshedMailbox = await refreshConnectedMailboxAccess({
          mailbox: activeMailbox,
        });
        const refreshedAccessToken = safeDecryptInboxSecret(refreshedMailbox.accessTokenEncrypted);
        if (!refreshedAccessToken) {
          throw error;
        }
        if (!isOauthMailboxProvider(refreshedMailbox.provider)) {
          throw error;
        }

        const result = await sendOauthMailboxEmail({
          provider: refreshedMailbox.provider,
          accessToken: refreshedAccessToken,
          mailboxEmailAddress: refreshedMailbox.emailAddress,
          mailboxDisplayName: refreshedMailbox.displayName,
          toEmail: input.toEmail,
          subject: input.subject,
          html: input.html,
          text,
          replyTo: input.replyTo,
          headers: input.headers,
          attachments: input.attachments,
        });

        return {
          externalId: result.externalId,
          providerThreadId: result.providerThreadId || null,
          deliveryStatus: "SENT",
          errorCode: null,
          errorMessage: null,
        } satisfies OutboundChannelResult;
      }
    } catch (error: any) {
      const metadata = parseConnectedMailboxMetadata(mailbox.metadata);
      const errorCode = String(error?.code || "email_oauth_send_failed");
      const errorMessage = String(error?.message || "Failed to send email.");

      if (
        errorCode === "mailbox_oauth_token_exchange_failed" ||
        errorCode === "mailbox_missing_access_token" ||
        Number(error?.status || 0) === 401
      ) {
        await markConnectedMailboxDisconnected({
          mailboxId: mailbox.id,
          metadata,
          reason: errorMessage,
        }).catch(() => undefined);
      }

      return {
        externalId: null,
        providerThreadId: null,
        deliveryStatus: "FAILED",
        errorCode,
        errorMessage,
      } satisfies OutboundChannelResult;
    }
  }

  const smtp = resolveSmtpConfig(credentials);
  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from) {
    return {
      externalId: null,
      providerThreadId: null,
      deliveryStatus: "FAILED",
      errorCode: "email_config_missing",
      errorMessage: "Email credentials are not configured.",
    } satisfies OutboundChannelResult;
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    const attachments = normalizeMailboxAttachments(input.attachments);
    const info = await transport.sendMail({
      from: smtp.from,
      to: input.toEmail,
      subject: input.subject,
      html: input.html,
      text,
      replyTo: input.replyTo,
      headers: input.headers,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: attachment.content,
      })),
    });

    return {
      externalId: String(info?.messageId || ""),
      providerThreadId: null,
      deliveryStatus: "SENT",
      errorCode: null,
      errorMessage: null,
    } satisfies OutboundChannelResult;
  } catch (error: any) {
    return {
      externalId: null,
      providerThreadId: null,
      deliveryStatus: "FAILED",
      errorCode: String(error?.code || "email_send_failed"),
      errorMessage: String(error?.message || "Failed to send email."),
    } satisfies OutboundChannelResult;
  }
}

function resolveWhatsAppConfig(credentials: DecryptedInboxCredentials) {
  return {
    accessToken: credentials.whatsapp?.accessToken || "",
    phoneNumberId: credentials.whatsapp?.phoneNumberId || "",
    apiVersion: credentials.whatsapp?.apiVersion || "v19.0",
    appSecret: credentials.whatsapp?.appSecret || "",
    verifyToken: credentials.whatsapp?.verifyToken || "",
  };
}

function normalizePhone(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 10) return `234${digits.slice(1)}`;
  return digits;
}

export async function sendOutboundWhatsApp(input: {
  inbox: InboxCredentialCarrier;
  toPhone: string;
  content: string;
}) {
  const credentials = decryptInboxCredentials(input.inbox.credentialsEncrypted);
  const config = resolveWhatsAppConfig(credentials);
  if (!config.accessToken || !config.phoneNumberId) {
    return {
      externalId: null,
      providerThreadId: null,
      deliveryStatus: "FAILED",
      errorCode: "whatsapp_config_missing",
      errorMessage: "WhatsApp credentials are not configured.",
    } satisfies OutboundChannelResult;
  }

  const to = normalizePhone(input.toPhone);
  if (!to) {
    return {
      externalId: null,
      providerThreadId: null,
      deliveryStatus: "FAILED",
      errorCode: "whatsapp_phone_missing",
      errorMessage: "Customer phone number is missing.",
    } satisfies OutboundChannelResult;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: input.content },
        }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        externalId: null,
        providerThreadId: null,
        deliveryStatus: "FAILED",
        errorCode: String(payload?.error?.code || `http_${response.status}`),
        errorMessage: String(payload?.error?.message || "WhatsApp send failed."),
      } satisfies OutboundChannelResult;
    }
    return {
      externalId: String(payload?.messages?.[0]?.id || ""),
      providerThreadId: null,
      deliveryStatus: "SENT",
      errorCode: null,
      errorMessage: null,
    } satisfies OutboundChannelResult;
  } catch (error: any) {
    return {
      externalId: null,
      providerThreadId: null,
      deliveryStatus: "FAILED",
      errorCode: String(error?.code || "whatsapp_send_failed"),
      errorMessage: String(error?.message || "WhatsApp send failed."),
    } satisfies OutboundChannelResult;
  }
}

export function resolveChannelConfig(input: { inbox: UnifiedInbox }) {
  const credentials = decryptInboxCredentials(input.inbox.credentialsEncrypted);
  return {
    email: resolveSmtpConfig(credentials),
    whatsapp: resolveWhatsAppConfig(credentials),
  };
}

export function verifyWhatsAppSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string;
}) {
  if (!input.appSecret) return false;
  const header = String(input.signatureHeader || "");
  if (!header.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", input.appSecret).update(input.rawBody).digest("hex");
  const actual = header.slice("sha256=".length).trim().toLowerCase();
  if (!actual || actual.length !== expected.length) return false;
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return crypto.timingSafeEqual(left, right);
}

export async function finalizeOutboundMessage(input: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  messageId: string;
  channel: UnifiedMessageChannel;
  result: OutboundChannelResult;
}) {
  await input.tx.unifiedMessage.update({
    where: { id: input.messageId },
    data: {
      externalId: input.result.externalId || undefined,
      deliveryStatus: input.result.deliveryStatus,
      errorCode: input.result.errorCode,
      errorMessage: input.result.errorMessage,
    },
  });
  if (input.result.deliveryStatus === "SENT") {
    await incrementUnifiedUsageCounter(input.tx, {
      tenantId: input.tenantId,
      channel: input.channel,
    });
  }
}

export async function markMessageDeliveryByExternalId(input: {
  inboxId: string;
  externalId: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const updated = await prisma.unifiedMessage.updateMany({
    where: {
      inboxId: input.inboxId,
      externalId: input.externalId,
    },
    data: {
      deliveryStatus: input.status,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    },
  });
  return updated.count;
}

export function buildConversationEmailSubject(input: { conversationId: string; contactName?: string | null }) {
  return input.contactName ? `Support: ${input.contactName}` : "Support conversation";
}

export function formatUnifiedInboxReplyToAddress(tenantId: string, conversationId?: string | null) {
  const rawReplyBase =
    process.env.EMAIL_INBOX_INBOUND ||
    process.env.PLATFORM_EMAIL_FROM ||
    process.env.EMAIL_INFO_FROM ||
    process.env.EMAIL_SUPPORT_REPLY_TO ||
    "inbox@mail.maboria.com";
  const normalizedFrom = String(rawReplyBase || "inbox@mail.maboria.com").trim();
  const atIndex = normalizedFrom.lastIndexOf("@");
  if (atIndex <= 0) {
    return conversationId ? `inbox+${tenantId}+${conversationId}@maboria.com` : `inbox+${tenantId}@maboria.com`;
  }
  const local = normalizedFrom.slice(0, atIndex).split("+")[0] || "inbox";
  const domain = normalizedFrom.slice(atIndex + 1) || "maboria.com";
  return conversationId ? `${local}+${tenantId}+${conversationId}@${domain}` : `${local}+${tenantId}@${domain}`;
}

export function extractInboxRouteFromInboundAddress(addresses: string[]) {
  for (const entry of addresses) {
    const value = String(entry || "");
    const plus = value.match(
      /[A-Za-z0-9._%+-]+\+([A-Za-z0-9_-]+)(?:\+([A-Za-z0-9_-]+))?@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
    );
    if (plus?.[1]) {
      return {
        tenantId: plus[1],
        conversationId: plus[2] || null,
      };
    }
  }
  return null;
}

export function extractConversationIdFromEmailSubject(subject: string) {
  const match = String(subject || "").match(/\[Conversation\s*#\s*([A-Za-z0-9_-]+)\]/i);
  return match?.[1] || null;
}

export function extractTenantIdFromInboundAddress(addresses: string[]) {
  return extractInboxRouteFromInboundAddress(addresses)?.tenantId || null;
}

export function parseSenderEmail(value: string) {
  const angleMatch = value.match(/<([^>]+)>/);
  const raw = angleMatch?.[1] || value;
  const direct = raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return direct?.[0]?.toLowerCase() || null;
}

export function parseSenderPhone(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

export function htmlToText(html: string) {
  return String(html || "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBasicHtmlEntities(value: string) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripQuotedEmailHtml(html: string) {
  return String(html || "")
    .replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi, " ")
    .replace(/<div[^>]*class=["'][^"']*(gmail_quote|yahoo_quoted|moz-cite-prefix)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, " ");
}

function htmlToTextWithBreaks(html: string) {
  return decodeBasicHtmlEntities(
    String(html || "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function stripQuotedReplyText(text: string) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const result: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (
      /^On .+wrote:$/i.test(trimmed) ||
      /^Am .+schrieb .+:$/i.test(trimmed) ||
      /^From:\s.+$/i.test(trimmed) ||
      /^Sent:\s.+$/i.test(trimmed) ||
      /^Subject:\s.+$/i.test(trimmed) ||
      /^To:\s.+$/i.test(trimmed) ||
      /^-----Original Message-----$/i.test(trimmed)
    ) {
      break;
    }

    if (trimmed.startsWith(">")) {
      break;
    }

    result.push(line);
  }

  return result.join("\n").trim();
}

function stripMobileSignature(text: string) {
  return String(text || "")
    .replace(/\n?Von meinem iPhone gesendet\s*$/i, "")
    .replace(/\n?Sent from my iPhone\s*$/i, "")
    .replace(/\n?Sent from my iPad\s*$/i, "")
    .replace(/\n?Get Outlook for (iOS|Android)\s*$/i, "")
    .trim();
}

export function extractInboundReplyText(input: { text?: string | null; html?: string | null }) {
  const plain = sanitizeInboundEmailDisplayText(
    stripMobileSignature(stripQuotedReplyText(String(input.text || "").trim()))
  );
  if (plain) return plain;

  const html = String(input.html || "").trim();
  if (!html) return "";

  const cleanedHtml = stripQuotedEmailHtml(html);
  return sanitizeInboundEmailDisplayText(
    stripMobileSignature(stripQuotedReplyText(htmlToTextWithBreaks(cleanedHtml)))
  );
}

export async function createOrResolveCustomerForInbound(input: {
  tenantId: string;
  ownerId: string;
  channel: UnifiedMessageChannel;
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
}) {
  const normalizedEmail = input.email?.toLowerCase().trim() || null;
  const normalizedPhone = input.phone ? normalizePhone(input.phone) : null;
  let existing = await prisma.customer.findFirst({
    where: {
      userId: input.ownerId,
      deletedAt: null,
      OR: [
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
      ],
    },
  });

  if (!existing) {
    const fallbackEmail =
      normalizedEmail ||
      `unknown+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}@placeholder.maboria.local`;
    existing = await prisma.customer.create({
      data: {
        userId: input.ownerId,
        name: input.displayName || normalizedEmail || normalizedPhone || "Unknown Customer",
        email: fallbackEmail,
        phone: normalizedPhone,
        deliveryPreference: input.channel === "WHATSAPP" ? "WHATSAPP" : "EMAIL",
      },
    });
  }

  return existing;
}

export function parseEmailThreadHeaders(input: {
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
}) {
  const clean = (value: string | null | undefined) =>
    String(value || "")
      .replace(/[<>]/g, "")
      .trim();

  const messageId = clean(input.messageId);
  const inReplyTo = clean(input.inReplyTo);
  const references = clean(input.references)
    .split(/\s+/)
    .filter(Boolean);

  return {
    messageId: messageId || null,
    inReplyTo: inReplyTo || null,
    references,
  };
}

export async function logChannelFailure(input: {
  tenantId: string;
  actionType: string;
  metadata: Prisma.InputJsonValue;
}) {
  try {
    await prisma.unifiedAuditEvent.create({
      data: {
        tenantId: input.tenantId,
        actionType: input.actionType,
        metadata: input.metadata,
      },
    });
  } catch (error: any) {
    log("error", "unified_channel_failure_log_failed", {
      tenantId: input.tenantId,
      actionType: input.actionType,
      error: error?.message,
    });
  }
}
