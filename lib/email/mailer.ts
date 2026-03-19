import "server-only";

import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export const EmailType = {
  PLATFORM: "PLATFORM",
  SECURITY: "SECURITY",
  NOTIFICATIONS: "NOTIFICATIONS",
  SUPPORT: "SUPPORT",
  BILLING: "BILLING",
  INFO: "INFO",
} as const;

export type EmailType = (typeof EmailType)[keyof typeof EmailType];

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type TypedMailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
  replyTo?: string;
  headers?: Record<string, string>;
};

export type SentMailResult = {
  messageId: string | null;
};

const platformFrom =
  process.env.PLATFORM_EMAIL_FROM ||
  process.env.EMAIL_FROM ||
  "info@maboria.com";
const supportFrom =
  process.env.EMAIL_SUPPORT_FROM ||
  process.env.SUPPORT_EMAIL ||
  platformFrom ||
  process.env.EMAIL_FROM ||
  "support@mail.maboria.com";
const billingFrom =
  process.env.EMAIL_BILLING_FROM || platformFrom || process.env.EMAIL_FROM || "billing@maboria.com";
const infoFrom = process.env.EMAIL_INFO_FROM || platformFrom || process.env.EMAIL_FROM || "info@maboria.com";
const notificationsFrom =
  process.env.EMAIL_NOTIFICATIONS_FROM || infoFrom;
const securityFrom =
  process.env.EMAIL_SECURITY_FROM || platformFrom;

const fromByType: Record<EmailType, string> = {
  PLATFORM: platformFrom,
  SECURITY: securityFrom,
  NOTIFICATIONS: notificationsFrom,
  SUPPORT: supportFrom,
  BILLING: billingFrom,
  INFO: infoFrom,
};

const VALID_EMAIL_TYPES = new Set<EmailType>(Object.values(EmailType));

function normalizeEmailError(err: unknown) {
  const message = String((err as Error | undefined)?.message || "");
  const lower = message.toLowerCase();
  if (lower.includes("resend") || lower.includes("unauthorized")) {
    return "Email delivery failed. Please verify your Resend configuration.";
  }
  if (lower.includes("domain") || lower.includes("sender") || lower.includes("from")) {
    return "Email delivery failed. Please verify your sender domain in Resend.";
  }
  return "Email delivery failed. Please try again.";
}

function assertKnownEmailType(type: EmailType | string): asserts type is EmailType {
  if (VALID_EMAIL_TYPES.has(type as EmailType)) return;
  log("error", "email_type_invalid", { type });
  throw new Error(`Unsupported email type: ${type}`);
}

function resolveFrom(type: EmailType) {
  const from = fromByType[type];
  if (from) return from;
  log("error", "email_from_missing", { type });
  throw new Error(`Sender is not configured for email type: ${type}`);
}

export async function sendMailByType(type: EmailType, payload: TypedMailPayload): Promise<SentMailResult> {
  assertKnownEmailType(type);
  const from = resolveFrom(type);
  if (!env.resendApiKey) {
    const safeError = new Error("Email delivery failed. Missing Resend API key.");
    (safeError as Error & { status?: number }).status = 502;
    throw safeError;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text || undefined,
        reply_to: payload.replyTo || undefined,
        headers: payload.headers,
        attachments: payload.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content.toString("base64"),
          type: attachment.contentType,
        })),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const resendMessage =
        typeof (result as { message?: unknown })?.message === "string"
          ? (result as { message: string }).message
          : typeof (result as { error?: unknown })?.error === "string"
            ? (result as { error: string }).error
            : `Resend request failed (${response.status})`;
      throw new Error(resendMessage);
    }

    const messageId =
      typeof (result as { id?: unknown })?.id === "string"
        ? (result as { id: string }).id
        : null;
    log("info", "email_sent", {
      type,
      to: payload.to,
      subject: payload.subject,
      provider: "resend",
      messageId,
    });
    return { messageId };
  } catch (error) {
    log("error", "email_send_failed", {
      type,
      to: payload.to,
      subject: payload.subject,
      provider: "resend",
      error: (error as Error).message,
    });
    const safeError = new Error(normalizeEmailError(error));
    (safeError as Error & { status?: number }).status = 502;
    throw safeError;
  }
}

export async function sendSupportMail(payload: TypedMailPayload) {
  return sendMailByType(EmailType.SUPPORT, payload);
}

export async function sendPlatformMail(payload: TypedMailPayload) {
  return sendMailByType(EmailType.PLATFORM, payload);
}

export async function sendSecurityMail(payload: TypedMailPayload) {
  return sendMailByType(EmailType.SECURITY, payload);
}

export async function sendNotificationsMail(payload: TypedMailPayload) {
  return sendMailByType(EmailType.NOTIFICATIONS, payload);
}

export async function sendBillingMail(payload: TypedMailPayload) {
  return sendMailByType(EmailType.BILLING, payload);
}

export async function sendInfoMail(payload: TypedMailPayload) {
  return sendMailByType(EmailType.INFO, payload);
}

export function getSenderForEmailType(type: EmailType) {
  assertKnownEmailType(type);
  return resolveFrom(type);
}
