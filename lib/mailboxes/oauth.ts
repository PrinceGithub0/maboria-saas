import "server-only";

import crypto from "crypto";
import { ConnectedMailboxProvider } from "@prisma/client";
import { encryptSecret, safeDecryptSecret } from "@/lib/crypto";

type OauthMailboxProvider = Extract<ConnectedMailboxProvider, "GMAIL" | "OUTLOOK">;

type MailboxOauthProviderConfig = {
  provider: OauthMailboxProvider;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
};

export type MailboxOauthFlowState = {
  provider: OauthMailboxProvider;
  state: string;
  codeVerifier: string;
  subscriberId: string;
  workspaceId: string;
  returnTo: string;
  bindUnifiedInbox: boolean;
  createdAt: number;
};

export type MailboxOauthTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
  tokenType: string | null;
};

export type MailboxOauthIdentity = {
  providerAccountId: string | null;
  emailAddress: string;
  displayName: string | null;
};

export type MailboxAttachmentInput = {
  name?: string | null;
  type?: string | null;
  size?: number | null;
  dataUrl?: string | null;
};

type NormalizedMailboxAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

export class MailboxOauthError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "mailbox_oauth_error") {
    super(message);
    this.name = "MailboxOauthError";
    this.status = status;
    this.code = code;
  }
}

const GOOGLE_GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GOOGLE_GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const MICROSOFT_GRAPH_USER_READ_SCOPE = "User.Read";
const MICROSOFT_GRAPH_MAIL_READWRITE_SCOPE = "Mail.ReadWrite";
const MICROSOFT_GRAPH_MAIL_SEND_SCOPE = "Mail.Send";
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

function envValue(...keys: string[]) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (isConfiguredSecretValue(value)) return value;
  }
  return "";
}

function isConfiguredSecretValue(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized.includes("your_") ||
    normalized.includes("_here") ||
    normalized.includes("example") ||
    normalized.includes("changeme") ||
    normalized.includes("replace_me")
  ) {
    return false;
  }
  return true;
}

const PROVIDER_CONFIG: Record<OauthMailboxProvider, MailboxOauthProviderConfig> = {
  GMAIL: {
    provider: "GMAIL",
    label: "Gmail",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId: envValue("GOOGLE_MAIL_CLIENT_ID", "GOOGLE_CLIENT_ID"),
    clientSecret: envValue("GOOGLE_MAIL_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"),
    scopes: ["openid", "email", "profile", GOOGLE_GMAIL_READ_SCOPE, GOOGLE_GMAIL_SEND_SCOPE],
  },
  OUTLOOK: {
    provider: "OUTLOOK",
    label: "Outlook / Microsoft 365",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientId: envValue("MICROSOFT_MAIL_CLIENT_ID", "MICROSOFT_CLIENT_ID", "AZURE_AD_CLIENT_ID"),
    clientSecret: envValue("MICROSOFT_MAIL_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET", "AZURE_AD_CLIENT_SECRET"),
    scopes: [
      "openid",
      "email",
      "profile",
      "offline_access",
      MICROSOFT_GRAPH_USER_READ_SCOPE,
      MICROSOFT_GRAPH_MAIL_READWRITE_SCOPE,
      MICROSOFT_GRAPH_MAIL_SEND_SCOPE,
    ],
  },
};

const MAILBOX_OAUTH_PROVIDER_VALUES = Object.keys(PROVIDER_CONFIG) as OauthMailboxProvider[];

export function isOauthMailboxProvider(value: string): value is OauthMailboxProvider {
  return MAILBOX_OAUTH_PROVIDER_VALUES.includes(value as OauthMailboxProvider);
}

export function getOauthMailboxProviderConfig(provider: OauthMailboxProvider) {
  return PROVIDER_CONFIG[provider];
}

export function isMailboxOauthProviderConfigured(provider: OauthMailboxProvider) {
  const config = getOauthMailboxProviderConfig(provider);
  return Boolean(config.clientId && config.clientSecret);
}

export function getMailboxOauthProviderAvailability() {
  return {
    GMAIL: isMailboxOauthProviderConfigured("GMAIL"),
    OUTLOOK: isMailboxOauthProviderConfigured("OUTLOOK"),
  } as const;
}

export function getMailboxOauthCookieName() {
  return "mb_mailbox_oauth";
}

export function getMailboxOauthCookieMaxAgeSeconds() {
  return OAUTH_COOKIE_MAX_AGE_SECONDS;
}

export function sanitizeMailboxReturnTo(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/dashboard/inbox";
  }
  return trimmed;
}

function base64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest();
}

function secureRandom(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function createMailboxOauthFlowState(input: Omit<MailboxOauthFlowState, "state" | "codeVerifier" | "createdAt">) {
  return {
    ...input,
    state: secureRandom(24),
    codeVerifier: secureRandom(48),
    createdAt: Date.now(),
  } satisfies MailboxOauthFlowState;
}

export function encodeMailboxOauthFlowState(value: MailboxOauthFlowState) {
  return encryptSecret(JSON.stringify(value));
}

export function decodeMailboxOauthFlowState(value: string | null | undefined) {
  if (!value) return null;
  try {
    const decrypted = safeDecryptSecret(value);
    if (!decrypted) return null;
    const json = JSON.parse(decrypted);
    if (!json || typeof json !== "object") return null;
    return json as MailboxOauthFlowState;
  } catch {
    return null;
  }
}

function assertConfiguredProvider(provider: OauthMailboxProvider) {
  const config = getOauthMailboxProviderConfig(provider);
  if (!isMailboxOauthProviderConfigured(provider)) {
    throw new MailboxOauthError(
      `${config.label} mailbox OAuth is not configured.`,
      503,
      "mailbox_oauth_not_configured"
    );
  }
  return config;
}

export function buildMailboxOauthAuthorizeUrl(input: {
  provider: OauthMailboxProvider;
  callbackUrl: string;
  flowState: MailboxOauthFlowState;
}) {
  const config = assertConfiguredProvider(input.provider);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: input.callbackUrl,
    response_type: "code",
    scope: config.scopes.join(" "),
    state: input.flowState.state,
    code_challenge: base64Url(sha256(input.flowState.codeVerifier)),
    code_challenge_method: "S256",
  });

  if (input.provider === "GMAIL") {
    params.set("access_type", "offline");
    params.set("include_granted_scopes", "true");
    params.set("prompt", "consent select_account");
  } else {
    params.set("response_mode", "query");
    params.set("prompt", "select_account");
  }

  return `${config.authorizeUrl}?${params.toString()}`;
}

async function readTokenResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new MailboxOauthError(
      String(payload?.error_description || payload?.error?.message || payload?.error || "Mailbox token exchange failed."),
      502,
      "mailbox_oauth_token_exchange_failed"
    );
  }

  const accessToken = String(payload?.access_token || "").trim();
  if (!accessToken) {
    throw new MailboxOauthError("Mailbox token exchange did not return an access token.", 502, "mailbox_missing_access_token");
  }

  const expiresIn = Number(payload?.expires_in || 0);
  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + Math.max(expiresIn - 60, 0) * 1000).toISOString()
      : null;

  return {
    accessToken,
    refreshToken: String(payload?.refresh_token || "").trim() || null,
    expiresAt,
    scope: String(payload?.scope || "").trim() || null,
    tokenType: String(payload?.token_type || "").trim() || null,
  } satisfies MailboxOauthTokenResponse;
}

export async function exchangeMailboxOauthCode(input: {
  provider: OauthMailboxProvider;
  code: string;
  codeVerifier: string;
  callbackUrl: string;
}) {
  const config = assertConfiguredProvider(input.provider);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    redirect_uri: input.callbackUrl,
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return readTokenResponse(response);
}

export async function refreshMailboxOauthToken(input: {
  provider: OauthMailboxProvider;
  refreshToken: string;
  callbackUrl: string;
}) {
  const config = assertConfiguredProvider(input.provider);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
  });

  if (input.provider === "OUTLOOK") {
    body.set("scope", config.scopes.join(" "));
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const tokens = await readTokenResponse(response);
  return {
    ...tokens,
    refreshToken: tokens.refreshToken || input.refreshToken,
  } satisfies MailboxOauthTokenResponse;
}

export async function fetchMailboxOauthIdentity(input: {
  provider: OauthMailboxProvider;
  accessToken: string;
}) {
  if (input.provider === "GMAIL") {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new MailboxOauthError(
        String(payload?.error_description || payload?.error?.message || "Unable to read Gmail profile."),
        502,
        "mailbox_profile_failed"
      );
    }
    const emailAddress = String(payload?.email || "").trim().toLowerCase();
    if (!emailAddress) {
      throw new MailboxOauthError("Gmail profile did not include an email address.", 502, "mailbox_profile_missing_email");
    }
    return {
      providerAccountId: String(payload?.sub || "").trim() || null,
      emailAddress,
      displayName: String(payload?.name || "").trim() || null,
    } satisfies MailboxOauthIdentity;
  }

  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new MailboxOauthError(
      String(payload?.error?.message || "Unable to read Outlook profile."),
      502,
      "mailbox_profile_failed"
    );
  }

  const emailAddress = String(payload?.mail || payload?.userPrincipalName || "").trim().toLowerCase();
  if (!emailAddress) {
    throw new MailboxOauthError("Outlook profile did not include an email address.", 502, "mailbox_profile_missing_email");
  }

  return {
    providerAccountId: String(payload?.id || "").trim() || null,
    emailAddress,
    displayName: String(payload?.displayName || "").trim() || null,
  } satisfies MailboxOauthIdentity;
}

function buildMailComposerMessage(input: {
  from: string;
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: NormalizedMailboxAttachment[];
}) {
  const MailComposer = require("nodemailer/lib/mail-composer");
  const composer = new MailComposer({
    from: input.from,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
    headers: input.headers,
    attachments: (input.attachments || []).map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.contentType,
      content: attachment.content,
    })),
  });

  return new Promise<Buffer>((resolve, reject) => {
    composer.compile().build((error: Error | null, message: Buffer) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(message);
    });
  });
}

export function normalizeMailboxAttachments(input: MailboxAttachmentInput[] | undefined) {
  const attachments = Array.isArray(input) ? input : [];
  if (!attachments.length) return [];

  let totalBytes = 0;
  const normalized = attachments.map((attachment, index) => {
    const dataUrl = String(attachment?.dataUrl || "").trim();
    if (!dataUrl) {
      throw new MailboxOauthError(`Attachment ${index + 1} is missing data.`, 422, "mailbox_attachment_missing_data");
    }

    const match = dataUrl.match(/^data:([^;,]+)?;base64,([\s\S]+)$/i);
    if (!match?.[2]) {
      throw new MailboxOauthError(
        `Attachment ${index + 1} uses an unsupported format.`,
        422,
        "mailbox_attachment_invalid_format"
      );
    }

    const content = Buffer.from(match[2], "base64");
    if (!content.length) {
      throw new MailboxOauthError(`Attachment ${index + 1} is empty.`, 422, "mailbox_attachment_empty");
    }
    if (content.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new MailboxOauthError(
        `Attachment ${attachment?.name || index + 1} exceeds the 8 MB limit.`,
        422,
        "mailbox_attachment_too_large"
      );
    }

    totalBytes += content.byteLength;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new MailboxOauthError("Total attachment size exceeds the 15 MB limit.", 422, "mailbox_attachments_too_large");
    }

    return {
      filename: String(attachment?.name || `attachment-${index + 1}`).trim() || `attachment-${index + 1}`,
      contentType: String(attachment?.type || match[1] || "application/octet-stream").trim() || "application/octet-stream",
      content,
    } satisfies NormalizedMailboxAttachment;
  });

  return normalized;
}

export async function sendOauthMailboxEmail(input: {
  provider: OauthMailboxProvider;
  accessToken: string;
  mailboxEmailAddress: string;
  mailboxDisplayName?: string | null;
  toEmail: string;
  ccEmails?: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: MailboxAttachmentInput[];
}) {
  const attachments = normalizeMailboxAttachments(input.attachments);
  const from =
    input.mailboxDisplayName && input.mailboxDisplayName.trim()
      ? `"${input.mailboxDisplayName.trim().replace(/"/g, '\\"')}" <${input.mailboxEmailAddress}>`
      : input.mailboxEmailAddress;

  if (input.provider === "GMAIL") {
    const mime = await buildMailComposerMessage({
      from,
      to: input.toEmail,
      cc: input.ccEmails,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      headers: input.headers,
      attachments,
    });

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: mime.toString("base64url"),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new MailboxOauthError(
        String(payload?.error?.message || "Gmail send failed."),
        response.status,
        "mailbox_send_failed"
      );
    }

    const sentMessageId = String(payload?.id || "").trim();
    let internetMessageId: string | null = null;
    if (sentMessageId) {
      const metadataUrl = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(sentMessageId)}`
      );
      metadataUrl.searchParams.set("format", "metadata");
      metadataUrl.searchParams.append("metadataHeaders", "Message-ID");
      const metadataResponse = await fetch(metadataUrl, {
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
        },
      });
      const metadataPayload = await metadataResponse.json().catch(() => ({}));
      if (metadataResponse.ok) {
        const headers = Array.isArray(metadataPayload?.payload?.headers) ? metadataPayload.payload.headers : [];
        const messageIdHeader = headers.find(
          (header: any) => String(header?.name || "").toLowerCase() === "message-id"
        );
        internetMessageId = String(messageIdHeader?.value || "").replace(/[<>]/g, "").trim() || null;
      }
    }

    return {
      externalId: internetMessageId || sentMessageId || null,
      providerThreadId: String(payload?.threadId || "").trim() || null,
    };
  }

  const draftMessage = {
    subject: input.subject,
    body: {
      contentType: "HTML",
      content: input.html,
    },
    toRecipients: [
      {
        emailAddress: {
          address: input.toEmail,
        },
      },
    ],
    ...(input.ccEmails?.length
      ? {
          ccRecipients: input.ccEmails.map((email) => ({
            emailAddress: {
              address: email,
            },
          })),
        }
      : {}),
    ...(input.replyTo
      ? {
          replyTo: [
            {
              emailAddress: {
                address: input.replyTo,
              },
            },
          ],
        }
      : {}),
    ...(input.headers && Object.keys(input.headers).length
      ? {
          internetMessageHeaders: Object.entries(input.headers).map(([name, value]) => ({
            name,
            value,
          })),
        }
      : {}),
    ...(attachments.length
      ? {
          attachments: attachments.map((attachment) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: attachment.filename,
            contentType: attachment.contentType,
            contentBytes: attachment.content.toString("base64"),
          })),
        }
      : {}),
  };

  try {
    const createDraftResponse = await fetch("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(draftMessage),
    });

    const draftPayload = await createDraftResponse.json().catch(() => ({}));
    if (!createDraftResponse.ok) {
      throw new MailboxOauthError(
        String(draftPayload?.error?.message || "Outlook draft creation failed."),
        createDraftResponse.status,
        "mailbox_send_failed"
      );
    }

    const draftId = String(draftPayload?.id || "").trim();
    if (!draftId) {
      throw new MailboxOauthError("Outlook draft creation did not return a message id.", 502, "mailbox_send_failed");
    }

    const sendResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draftId)}/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!sendResponse.ok) {
      const payload = await sendResponse.json().catch(() => ({}));
      throw new MailboxOauthError(
        String(payload?.error?.message || "Outlook send failed."),
        sendResponse.status,
        "mailbox_send_failed"
      );
    }

    return {
      externalId: String(draftPayload?.internetMessageId || "").replace(/[<>]/g, "").trim() || draftId,
      providerThreadId: String(draftPayload?.conversationId || "").trim() || null,
    };
  } catch (error: any) {
    const message = String(error?.message || "");
    const status = Number(error?.status || 0);
    const shouldFallback =
      status === 403 ||
      /access is denied/i.test(message) ||
      /insufficient privileges/i.test(message);

    if (!shouldFallback) {
      throw error;
    }
  }

  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: draftMessage,
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new MailboxOauthError(
      String(payload?.error?.message || "Outlook send failed."),
      response.status,
      "mailbox_send_failed"
    );
  }

  return {
    externalId: response.headers.get("request-id") || response.headers.get("client-request-id") || null,
    providerThreadId: null,
  };
}
