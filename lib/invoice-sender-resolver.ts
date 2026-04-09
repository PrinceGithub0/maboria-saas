import "server-only";

import { getSenderForEmailType, sendBillingMail, type MailAttachment } from "@/lib/email";
import { decryptInboxCredentials, getConnectedMailboxAccess } from "@/lib/inbox/channels";
import { sendOauthMailboxEmail } from "@/lib/mailboxes/oauth";
import { prisma } from "@/lib/prisma";
import { resolveCustomerContactPolicy, type CustomerComplianceContact } from "@/lib/customers/compliance";
import { normalizeInternationalPhoneDigits } from "@/lib/phone";

export type InvoiceSenderType = "gmail" | "outlook" | "whatsapp" | "platform_fallback";
export type InvoiceSendMode = "direct_connection" | "platform_fallback";
export type InvoiceSenderResolutionSource = "selected" | "workspace_default" | "auto_best" | "platform_fallback";

export type InvoiceWorkspaceSenderOption = {
  id: string;
  senderType: Exclude<InvoiceSenderType, "platform_fallback">;
  senderAddress: string;
  replyToAddress: string | null;
  isVerified: boolean;
  sendMode: "direct_connection";
  isDefault: boolean;
  label: string;
};

export type ResolvedInvoiceSender = {
  senderId: string | null;
  senderType: InvoiceSenderType;
  senderAddress: string;
  replyToAddress: string | null;
  sendMode: InvoiceSendMode;
  resolutionSource: InvoiceSenderResolutionSource;
};

export function pickPreferredInvoiceSenderOption<T extends { id: string; senderType: "gmail" | "outlook" | "whatsapp" }>(input: {
  options: T[];
  workspaceDefaultSenderId?: string | null;
}) {
  const defaultOption =
    input.workspaceDefaultSenderId
      ? input.options.find((candidate) => candidate.id === input.workspaceDefaultSenderId) || null
      : null;
  if (defaultOption) {
    return {
      option: defaultOption,
      resolutionSource: "workspace_default" as const,
    };
  }

  const bestOption = input.options[0] || null;
  if (!bestOption) return null;
  return {
    option: bestOption,
    resolutionSource: "auto_best" as const,
  };
}

type ConnectedMailboxRecord = {
  id: string;
  provider: "GMAIL" | "OUTLOOK";
  status: string;
  emailAddress: string;
  displayName: string | null;
  createdAt: Date;
};

type WhatsAppInboxRecord = {
  id: string;
  status: string;
  name: string;
  credentialsEncrypted: string | null;
  createdAt: Date;
};

type WorkspaceSenderCandidate =
  | {
      id: string;
      senderType: "gmail" | "outlook";
      senderAddress: string;
      replyToAddress: string | null;
      isVerified: boolean;
      sendMode: "direct_connection";
      label: string;
      providerRef: ConnectedMailboxRecord;
    }
  | {
      id: string;
      senderType: "whatsapp";
      senderAddress: string;
      replyToAddress: string | null;
      isVerified: boolean;
      sendMode: "direct_connection";
      label: string;
      providerRef: WhatsAppInboxRecord;
    };

function parseInvoiceSenderPriority() {
  const configured = String(process.env.INVOICE_SENDER_PRIORITY || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const normalized = configured.filter(
    (value): value is "gmail" | "outlook" | "whatsapp" =>
      value === "gmail" || value === "outlook" || value === "whatsapp"
  );
  return normalized.length > 0 ? normalized : (["gmail", "outlook", "whatsapp"] as const);
}

const INVOICE_SENDER_PRIORITY = parseInvoiceSenderPriority();

function priorityRank(type: WorkspaceSenderCandidate["senderType"]) {
  const index = INVOICE_SENDER_PRIORITY.indexOf(type);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function toInvoiceSenderType(provider: "GMAIL" | "OUTLOOK"): "gmail" | "outlook" {
  return provider === "GMAIL" ? "gmail" : "outlook";
}

function normalizePhone(value: string | null | undefined) {
  try {
    return normalizeInternationalPhoneDigits(value, { allowEmpty: true }) || "";
  } catch {
    return "";
  }
}

function renderSenderLabel(input: {
  senderType: WorkspaceSenderCandidate["senderType"];
  address: string;
  displayName?: string | null;
  verifiedName?: string | null;
}) {
  if (input.senderType === "gmail") {
    return `Gmail - ${input.displayName || input.address}`;
  }
  if (input.senderType === "outlook") {
    return `Outlook - ${input.displayName || input.address}`;
  }
  return `WhatsApp - ${input.verifiedName || input.address}`;
}

function buildWorkspaceSenderCandidate(
  source: ConnectedMailboxRecord | WhatsAppInboxRecord,
  replyToAddress: string | null
): WorkspaceSenderCandidate | null {
  if ("provider" in source) {
    if (source.status !== "ACTIVE") return null;
    const senderType = toInvoiceSenderType(source.provider);
    return {
      id: source.id,
      senderType,
      senderAddress: source.emailAddress,
      replyToAddress,
      isVerified: true,
      sendMode: "direct_connection",
      label: renderSenderLabel({
        senderType,
        address: source.emailAddress,
        displayName: source.displayName,
      }),
      providerRef: source,
    };
  }

  const credentials = decryptInboxCredentials(source.credentialsEncrypted);
  if (
    source.status !== "ACTIVE" ||
    !credentials.whatsapp?.accessToken ||
    !credentials.whatsapp?.phoneNumberId
  ) {
    return null;
  }
  const phone = credentials.whatsapp.displayPhoneNumber || credentials.whatsapp.phoneNumberId || source.name;
  return {
    id: source.id,
    senderType: "whatsapp",
    senderAddress: String(phone).trim(),
    replyToAddress,
    isVerified: true,
    sendMode: "direct_connection",
    label: renderSenderLabel({
      senderType: "whatsapp",
      address: String(phone).trim(),
      verifiedName: credentials.whatsapp.verifiedName || null,
    }),
    providerRef: source,
  };
}

async function getWorkspaceDefaultSender(workspaceId: string) {
  return prisma.business.findUnique({
    where: { id: workspaceId },
    select: {
      workspaceDefaultSenderId: true,
      workspaceDefaultSenderType: true,
    },
  });
}

async function getConnectedMailboxCandidate(workspaceId: string, senderId: string, replyToAddress: string | null) {
  const mailbox = await prisma.connectedMailbox.findFirst({
    where: {
      id: senderId,
      workspaceId,
      provider: { in: ["GMAIL", "OUTLOOK"] },
    },
    select: {
      id: true,
      provider: true,
      status: true,
      emailAddress: true,
      displayName: true,
      createdAt: true,
    },
  });
  return mailbox ? buildWorkspaceSenderCandidate(mailbox as ConnectedMailboxRecord, replyToAddress) : null;
}

async function getWhatsAppCandidate(workspaceId: string, senderId: string, replyToAddress: string | null) {
  const inbox = await prisma.unifiedInbox.findFirst({
    where: {
      id: senderId,
      tenantId: workspaceId,
      type: "WHATSAPP",
    },
    select: {
      id: true,
      status: true,
      name: true,
      credentialsEncrypted: true,
      createdAt: true,
    },
  });
  return inbox ? buildWorkspaceSenderCandidate(inbox as WhatsAppInboxRecord, replyToAddress) : null;
}

async function getWorkspaceSenderCandidateById(
  workspaceId: string,
  senderId: string,
  replyToAddress: string | null
) {
  const [mailbox, whatsapp] = await Promise.all([
    getConnectedMailboxCandidate(workspaceId, senderId, replyToAddress),
    getWhatsAppCandidate(workspaceId, senderId, replyToAddress),
  ]);
  return mailbox || whatsapp || null;
}

export async function listWorkspaceInvoiceSenders(input: {
  workspaceId: string;
  replyToAddress?: string | null;
}) {
  const defaultSender = await getWorkspaceDefaultSender(input.workspaceId);
  const [mailboxes, whatsappInboxes] = await Promise.all([
    prisma.connectedMailbox.findMany({
      where: {
        workspaceId: input.workspaceId,
        provider: { in: ["GMAIL", "OUTLOOK"] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        provider: true,
        status: true,
        emailAddress: true,
        displayName: true,
        createdAt: true,
      },
    }),
    prisma.unifiedInbox.findMany({
      where: {
        tenantId: input.workspaceId,
        type: "WHATSAPP",
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        status: true,
        name: true,
        credentialsEncrypted: true,
        createdAt: true,
      },
    }),
  ]);

  const candidates = [
    ...mailboxes
      .map((mailbox) => buildWorkspaceSenderCandidate(mailbox as ConnectedMailboxRecord, input.replyToAddress || null))
      .filter((value): value is WorkspaceSenderCandidate => Boolean(value)),
    ...whatsappInboxes
      .map((inbox) => buildWorkspaceSenderCandidate(inbox as WhatsAppInboxRecord, input.replyToAddress || null))
      .filter((value): value is WorkspaceSenderCandidate => Boolean(value)),
  ].sort((left, right) => {
    const rankDelta = priorityRank(left.senderType) - priorityRank(right.senderType);
    if (rankDelta !== 0) return rankDelta;
    return left.label.localeCompare(right.label);
  });

  return {
    workspaceDefaultSenderId: defaultSender?.workspaceDefaultSenderId || null,
    workspaceDefaultSenderType:
      defaultSender?.workspaceDefaultSenderType === "GMAIL"
        ? "gmail"
        : defaultSender?.workspaceDefaultSenderType === "OUTLOOK"
          ? "outlook"
          : defaultSender?.workspaceDefaultSenderType === "WHATSAPP"
            ? "whatsapp"
            : null,
    options: candidates.map((candidate) => ({
      id: candidate.id,
      senderType: candidate.senderType,
      senderAddress: candidate.senderAddress,
      replyToAddress: candidate.replyToAddress,
      isVerified: candidate.isVerified,
      sendMode: candidate.sendMode,
      isDefault: defaultSender?.workspaceDefaultSenderId === candidate.id,
      label: candidate.label,
    })) satisfies InvoiceWorkspaceSenderOption[],
  };
}

function toResolvedSender(
  candidate: WorkspaceSenderCandidate,
  resolutionSource: Exclude<InvoiceSenderResolutionSource, "platform_fallback">
): ResolvedInvoiceSender {
  return {
    senderId: candidate.id,
    senderType: candidate.senderType,
    senderAddress: candidate.senderAddress,
    replyToAddress: candidate.replyToAddress,
    sendMode: "direct_connection",
    resolutionSource,
  };
}

export async function resolveInvoiceSender(input: {
  workspaceId: string;
  selectedSenderId?: string | null;
  replyToAddress?: string | null;
}) {
  const replyToAddress = input.replyToAddress?.trim() || null;
  if (input.selectedSenderId) {
    const selected = await getWorkspaceSenderCandidateById(input.workspaceId, input.selectedSenderId, replyToAddress);
    if (!selected) {
      const error = new Error("Selected sender is disconnected, unverified, or not part of this workspace.");
      (error as Error & { status?: number }).status = 422;
      throw error;
    }
    return toResolvedSender(selected, "selected");
  }

  const { workspaceDefaultSenderId, options } = await listWorkspaceInvoiceSenders({
    workspaceId: input.workspaceId,
    replyToAddress,
  });

  if (workspaceDefaultSenderId) {
    const picked = pickPreferredInvoiceSenderOption({
      options,
      workspaceDefaultSenderId,
    });
    if (picked) {
      return {
        senderId: picked.option.id,
        senderType: picked.option.senderType,
        senderAddress: picked.option.senderAddress,
        replyToAddress: picked.option.replyToAddress,
        sendMode: "direct_connection",
        resolutionSource: picked.resolutionSource,
      } satisfies ResolvedInvoiceSender;
    }
  }

  if (options[0]) {
    return {
      senderId: options[0].id,
      senderType: options[0].senderType,
      senderAddress: options[0].senderAddress,
      replyToAddress: options[0].replyToAddress,
      sendMode: "direct_connection",
      resolutionSource: "auto_best",
    } satisfies ResolvedInvoiceSender;
  }

  return {
    senderId: null,
    senderType: "platform_fallback",
    senderAddress: getSenderForEmailType("BILLING"),
    replyToAddress,
    sendMode: "platform_fallback",
    resolutionSource: "platform_fallback",
  } satisfies ResolvedInvoiceSender;
}

function assertCustomerSupportsEmail(customer?: CustomerComplianceContact | null) {
  const policy = resolveCustomerContactPolicy(customer);
  if (policy.shouldEmail) return;
  const error = new Error(policy.blockedReason || "Customer email contact is not available.");
  (error as Error & { status?: number }).status = 422;
  throw error;
}

function assertCustomerSupportsWhatsApp(customer?: CustomerComplianceContact | null) {
  const policy = resolveCustomerContactPolicy(customer);
  if (policy.shouldWhatsapp) return;
  const error = new Error(policy.blockedReason || "Customer WhatsApp contact is not available.");
  (error as Error & { status?: number }).status = 422;
  throw error;
}

export async function resolveInvoiceSenderForCustomer(input: {
  workspaceId: string;
  selectedSenderId?: string | null;
  replyToAddress?: string | null;
  customer?: CustomerComplianceContact | null;
}) {
  const replyToAddress = input.replyToAddress?.trim() || null;
  if (input.selectedSenderId) {
    const selected = await resolveInvoiceSender({
      workspaceId: input.workspaceId,
      selectedSenderId: input.selectedSenderId,
      replyToAddress,
    });
    if (selected.senderType === "whatsapp") {
      assertCustomerSupportsWhatsApp(input.customer);
    } else {
      assertCustomerSupportsEmail(input.customer);
    }
    return selected;
  }

  const { workspaceDefaultSenderId, options } = await listWorkspaceInvoiceSenders({
    workspaceId: input.workspaceId,
    replyToAddress,
  });

  const emailAllowed = resolveCustomerContactPolicy(input.customer).shouldEmail;
  const whatsappAllowed = resolveCustomerContactPolicy(input.customer).shouldWhatsapp;
  const compatibleOptions = options.filter((option) =>
    option.senderType === "whatsapp" ? whatsappAllowed : emailAllowed
  );

  const picked = pickPreferredInvoiceSenderOption({
    options: compatibleOptions,
    workspaceDefaultSenderId,
  });
  if (picked) {
    return {
      senderId: picked.option.id,
      senderType: picked.option.senderType,
      senderAddress: picked.option.senderAddress,
      replyToAddress: picked.option.replyToAddress,
      sendMode: "direct_connection",
      resolutionSource: picked.resolutionSource,
    } satisfies ResolvedInvoiceSender;
  }

  if (emailAllowed) {
    return {
      senderId: null,
      senderType: "platform_fallback",
      senderAddress: getSenderForEmailType("BILLING"),
      replyToAddress,
      sendMode: "platform_fallback",
      resolutionSource: "platform_fallback",
    } satisfies ResolvedInvoiceSender;
  }

  assertCustomerSupportsWhatsApp(input.customer);
  throw new Error("Customer contact policy blocks delivery.");
}

export async function resolveInvoiceEmailSender(input: {
  workspaceId: string;
  replyToAddress?: string | null;
  customer?: CustomerComplianceContact | null;
}) {
  const replyToAddress = input.replyToAddress?.trim() || null;
  assertCustomerSupportsEmail(input.customer);

  const { workspaceDefaultSenderId, options } = await listWorkspaceInvoiceSenders({
    workspaceId: input.workspaceId,
    replyToAddress,
  });
  const emailOptions = options.filter((option) => option.senderType !== "whatsapp");
  const picked = pickPreferredInvoiceSenderOption({
    options: emailOptions,
    workspaceDefaultSenderId,
  });

  if (picked) {
    return {
      senderId: picked.option.id,
      senderType: picked.option.senderType,
      senderAddress: picked.option.senderAddress,
      replyToAddress: picked.option.replyToAddress,
      sendMode: "direct_connection",
      resolutionSource: picked.resolutionSource,
    } satisfies ResolvedInvoiceSender;
  }

  return {
    senderId: null,
    senderType: "platform_fallback",
    senderAddress: getSenderForEmailType("BILLING"),
    replyToAddress,
    sendMode: "platform_fallback",
    resolutionSource: "platform_fallback",
  } satisfies ResolvedInvoiceSender;
}

export async function setWorkspaceDefaultInvoiceSender(input: {
  workspaceId: string;
  senderId: string;
  replyToAddress?: string | null;
}) {
  const candidate = await getWorkspaceSenderCandidateById(
    input.workspaceId,
    input.senderId,
    input.replyToAddress?.trim() || null
  );
  if (!candidate) {
    const error = new Error("Only verified workspace senders can be saved as default.");
    (error as Error & { status?: number }).status = 422;
    throw error;
  }

  const senderType =
    candidate.senderType === "gmail"
      ? "GMAIL"
      : candidate.senderType === "outlook"
        ? "OUTLOOK"
        : "WHATSAPP";

  await prisma.business.update({
    where: { id: input.workspaceId },
    data: {
      workspaceDefaultSenderId: candidate.id,
      workspaceDefaultSenderType: senderType,
    },
  });

  return candidate;
}

function toMailboxAttachments(attachments?: MailAttachment[]) {
  return (attachments || []).map((attachment) => ({
    name: attachment.filename,
    type: attachment.contentType || "application/octet-stream",
    size: attachment.content.byteLength,
    dataUrl: `data:${attachment.contentType || "application/octet-stream"};base64,${attachment.content.toString("base64")}`,
  }));
}

async function sendInvoiceViaConnectedMailbox(input: {
  workspaceId: string;
  senderId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  attachments?: MailAttachment[];
}) {
  const access = await getConnectedMailboxAccess({ mailboxId: input.senderId });
  if (!access || access.mailbox.workspaceId !== input.workspaceId || !access.accessToken) {
    const error = new Error("Selected sender is disconnected, unverified, or not part of this workspace.");
    (error as Error & { status?: number }).status = 422;
    throw error;
  }

  if (access.mailbox.provider !== "GMAIL" && access.mailbox.provider !== "OUTLOOK") {
    const error = new Error("Selected sender does not support email delivery.");
    (error as Error & { status?: number }).status = 422;
    throw error;
  }

  return sendOauthMailboxEmail({
    provider: access.mailbox.provider,
    accessToken: access.accessToken,
    mailboxEmailAddress: access.mailbox.emailAddress,
    mailboxDisplayName: access.mailbox.displayName,
    toEmail: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo || undefined,
    attachments: toMailboxAttachments(input.attachments),
  });
}

async function sendWorkspaceWhatsAppRequest(input: {
  workspaceId: string;
  senderId: string;
  payload: Record<string, unknown>;
}) {
  const inbox = await prisma.unifiedInbox.findFirst({
    where: {
      id: input.senderId,
      tenantId: input.workspaceId,
      type: "WHATSAPP",
      status: "ACTIVE",
    },
    select: {
      credentialsEncrypted: true,
    },
  });
  if (!inbox) {
    const error = new Error("Selected sender is disconnected, unverified, or not part of this workspace.");
    (error as Error & { status?: number }).status = 422;
    throw error;
  }

  const credentials = decryptInboxCredentials(inbox.credentialsEncrypted);
  const accessToken = String(credentials.whatsapp?.accessToken || "").trim();
  const phoneNumberId = String(credentials.whatsapp?.phoneNumberId || "").trim();
  const apiVersion = String(credentials.whatsapp?.apiVersion || "v19.0").trim() || "v19.0";

  if (!accessToken || !phoneNumberId) {
    const error = new Error("Selected WhatsApp channel is not configured.");
    (error as Error & { status?: number }).status = 422;
    throw error;
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String((body as any)?.error?.message || "WhatsApp send failed."));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body as { messages?: Array<{ id?: string }> };
}

export async function sendInvoiceThroughResolvedSender(input: {
  workspaceId: string;
  resolvedSender: ResolvedInvoiceSender;
  toEmail?: string | null;
  toPhone?: string | null;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
  whatsappBody?: string;
  whatsappDocuments?: Array<{
    link: string;
    filename: string;
    caption?: string | null;
  }>;
}) {
  if (input.resolvedSender.senderType === "gmail" || input.resolvedSender.senderType === "outlook") {
    const to = String(input.toEmail || "").trim();
    if (!to) {
      const error = new Error("Customer email contact is missing.");
      (error as Error & { status?: number }).status = 422;
      throw error;
    }
    return sendInvoiceViaConnectedMailbox({
      workspaceId: input.workspaceId,
      senderId: String(input.resolvedSender.senderId || ""),
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.resolvedSender.replyToAddress,
      attachments: input.attachments,
    });
  }

  if (input.resolvedSender.senderType === "platform_fallback") {
    const to = String(input.toEmail || "").trim();
    if (!to) {
      const error = new Error("Customer email contact is missing.");
      (error as Error & { status?: number }).status = 422;
      throw error;
    }
    return sendBillingMail({
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
      replyTo: input.resolvedSender.replyToAddress || undefined,
    });
  }

  const toPhone = normalizePhone(input.toPhone);
  if (!toPhone) {
    const error = new Error("Customer WhatsApp contact is missing.");
    (error as Error & { status?: number }).status = 422;
    throw error;
  }

  const textPayload = {
    messaging_product: "whatsapp",
    to: toPhone,
    type: "text",
    text: { body: String(input.whatsappBody || input.text || "").trim() },
  };
  const firstResponse = await sendWorkspaceWhatsAppRequest({
    workspaceId: input.workspaceId,
    senderId: String(input.resolvedSender.senderId || ""),
    payload: textPayload,
  });

  for (const document of input.whatsappDocuments || []) {
    await sendWorkspaceWhatsAppRequest({
      workspaceId: input.workspaceId,
      senderId: String(input.resolvedSender.senderId || ""),
      payload: {
        messaging_product: "whatsapp",
        to: toPhone,
        type: "document",
        document: {
          link: document.link,
          filename: document.filename,
          ...(document.caption ? { caption: document.caption } : {}),
        },
      },
    });
  }

  return {
    externalId: String(firstResponse.messages?.[0]?.id || ""),
  };
}
