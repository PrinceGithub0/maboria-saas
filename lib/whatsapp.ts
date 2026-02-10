import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { log } from "./logger";
import { enforceEntitlement, enforceUsageLimit } from "./entitlements";
import { recordAnalyticsEvent } from "./analytics";

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v19.0";
const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED !== "false";
const WHATSAPP_TIMEOUT_MS = 10_000;
const WHATSAPP_RETRY_DELAY_MS = 600;

type WhatsAppSendResult = {
  messaging_product: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
};

type WhatsAppErrorClass =
  | "validation_error"
  | "policy_block"
  | "rate_limit"
  | "network_error"
  | "meta_error"
  | "unknown";

type WhatsAppErrorDetails = {
  classification: WhatsAppErrorClass;
  status?: number;
  metaCode?: number;
  metaType?: string;
  metaMessage?: string;
};

function assertWhatsAppConfig() {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WhatsApp configuration missing");
  }
}

function maskPhone(value: string) {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 2)}****${digits.slice(-2)}`;
}

export function normalizePhoneNumber(input: string) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) {
    const error = new Error("Phone number is required");
    (error as any).status = 400;
    throw error;
  }

  let normalized = digits;
  if (normalized.startsWith("00")) {
    normalized = normalized.slice(2);
  }

  if (normalized.startsWith("0")) {
    if (normalized.length === 11) {
      normalized = `234${normalized.slice(1)}`;
    } else if (normalized.length >= 10 && normalized.length <= 13) {
      normalized = `49${normalized.slice(1)}`;
    } else {
      const error = new Error("Invalid phone number");
      (error as any).status = 400;
      throw error;
    }
  }

  if (normalized.length < 8 || normalized.length > 15) {
    const error = new Error("Invalid phone number");
    (error as any).status = 400;
    throw error;
  }

  return normalized;
}

function classifyWhatsAppError(
  status: number | undefined,
  meta: any,
  err?: any
): WhatsAppErrorDetails {
  const metaType = (meta as any)?.type as string | undefined;
  const metaCode = (meta as any)?.code as number | undefined;
  const metaMessage = (meta as any)?.message as string | undefined;
  const message = metaMessage || err?.message || "";
  const lowered = String(message).toLowerCase();
  const code = metaCode;

  if (status === 429 || lowered.includes("rate limit")) {
    return { classification: "rate_limit", status, metaCode: code, metaType, metaMessage: message };
  }

  if (
    code === 131047 ||
    code === 131051 ||
    code === 131052 ||
    lowered.includes("not in allowed list") ||
    lowered.includes("outside") ||
    lowered.includes("not permitted")
  ) {
    return { classification: "policy_block", status, metaCode: code, metaType, metaMessage: message };
  }

  if (status === 400 || lowered.includes("invalid")) {
    return { classification: "validation_error", status, metaCode: code, metaType, metaMessage: message };
  }

  if (err?.name === "AbortError" || ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND"].includes(err?.code)) {
    return { classification: "network_error", status, metaCode: code, metaType, metaMessage: message };
  }

  if (status && status >= 500) {
    return { classification: "network_error", status, metaCode: code, metaType, metaMessage: message };
  }

  if (meta) {
    return { classification: "meta_error", status, metaCode: code, metaType, metaMessage: message };
  }

  return { classification: "unknown", status, metaCode: code, metaType, metaMessage: message };
}

function buildWhatsAppError(details: WhatsAppErrorDetails) {
  const error = new Error(details.metaMessage || "WhatsApp send failed");
  (error as any).status = details.status || 500;
  (error as any).classification = details.classification;
  (error as any).metaCode = details.metaCode;
  (error as any).metaType = details.metaType;
  return error;
}

async function sendWhatsAppPayload(payload: Record<string, unknown>) {
  if (!WHATSAPP_ENABLED) {
    log("info", "whatsapp_send_skipped", { reason: "disabled" });
    return { skipped: true } as const;
  }

  assertWhatsAppConfig();
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WHATSAPP_TIMEOUT_MS);
    log("info", "whatsapp_send_attempt", {
      type: payload.type,
      to: maskPhone(String(payload.to || "")),
      attempt,
    });

    let res: Response | null = null;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      const details = classifyWhatsAppError(undefined, undefined, err);
      log("error", "whatsapp_send_failed", {
        classification: details.classification,
        code: details.metaCode,
        message: details.metaMessage,
        attempt,
      });
      if (details.classification === "network_error" && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, WHATSAPP_RETRY_DELAY_MS));
        continue;
      }
      throw buildWhatsAppError(details);
    } finally {
      clearTimeout(timeout);
    }

    const data = (await res.json().catch(() => ({}))) as WhatsAppSendResult & {
      error?: { message?: string; type?: string; code?: number };
    };

    if (!res.ok) {
      const details = classifyWhatsAppError(res.status, data?.error);
      log("error", "whatsapp_send_failed", {
        classification: details.classification,
        code: details.metaCode,
        message: details.metaMessage,
        attempt,
      });
      if (details.classification === "network_error" && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, WHATSAPP_RETRY_DELAY_MS));
        continue;
      }
      throw buildWhatsAppError(details);
    }

    const messageId = data?.messages?.[0]?.id;
    log("info", "whatsapp_send_success", { messageId });

    // Meta may acknowledge (200 OK) before delivery in test/unverified mode.
    // This is expected and not a system error.

    return { ...data, messageId };
  }

  throw new Error("WhatsApp send failed after retry");
}

export async function sendWhatsAppText({
  to,
  body,
}: {
  to: string;
  body: string;
}) {
  const normalized = normalizePhoneNumber(to);
  return sendWhatsAppPayload({
    messaging_product: "whatsapp",
    to: normalized,
    type: "text",
    text: { body },
  });
}

export async function sendWhatsAppTemplate({
  to,
  name,
  language = "en_US",
  components,
}: {
  to: string;
  name: string;
  language?: string;
  components?: Array<Record<string, unknown>>;
}) {
  const normalized = normalizePhoneNumber(to);
  return sendWhatsAppPayload({
    messaging_product: "whatsapp",
    to: normalized,
    type: "template",
    template: {
      name,
      language: { code: language },
      ...(components ? { components } : {}),
    },
  });
}

export async function notifyInvoiceCreated({
  userId,
  invoiceNumber,
  customerName,
  total,
  currency,
}: {
  userId: string;
  invoiceNumber: string;
  customerName?: string | null;
  total?: number;
  currency?: string;
}) {
  const entitlement = await enforceEntitlement(userId, {
    feature: "whatsapp",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    log("info", "whatsapp_send_blocked", {
      userId,
      invoiceNumber,
      reason: entitlement.reason,
      type: entitlement.type,
      requiredPlan: entitlement.requiredPlan,
    });
    return;
  }

  const usage = await enforceUsageLimit(userId, "whatsappMessages");
  if (!usage.ok) {
    log("info", "whatsapp_send_blocked", {
      userId,
      invoiceNumber,
      reason: "limit_reached",
      plan: usage.plan,
      limit: usage.limit,
      used: usage.used,
    });
    return;
  }

  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile?.businessPhone) {
    log("info", "whatsapp_invoice_skipped_no_phone", { userId, invoiceNumber });
    return;
  }

  const amount =
    typeof total === "number" && currency ? ` (${currency} ${total.toFixed(2)})` : "";
  const customer = customerName ? ` for ${customerName}` : "";
  const body = `Invoice ${invoiceNumber} created${customer}${amount}.`;

  const conversation = await ensureConversationForUserPhone(userId, profile.businessPhone, {
    invoiceNumber,
  });
  sendWhatsAppText({ to: profile.businessPhone, body })
    .then(async (result: any) => {
      const status = result?.skipped ? "FAILED" : "SENT";
      if (conversation) {
        await recordOutboundMessage({
          conversationId: conversation.id,
          content: body,
          status,
          metaMessageId: result?.messageId,
        });
      }
      if (result?.skipped) {
        log("info", "whatsapp_send_skipped", { reason: "disabled", invoiceNumber });
        return;
      }
      log("info", "whatsapp_invoice_sent", { userId, invoiceNumber, messageId: result?.messageId });
    })
    .catch(async (error: any) => {
      if (conversation) {
        await recordOutboundMessage({
          conversationId: conversation.id,
          content: body,
          status: "FAILED",
        });
      }
      log("error", "whatsapp_invoice_failed", {
        userId,
        invoiceNumber,
        classification: error?.classification,
        metaCode: error?.metaCode,
        message: error?.message,
      });
    });
}

export async function notifyPaymentSucceeded({
  userId,
  provider,
  amount,
  currency,
  reference,
}: {
  userId: string;
  provider: "PAYSTACK" | "FLUTTERWAVE";
  amount: number;
  currency: string;
  reference: string;
}) {
  const entitlement = await enforceEntitlement(userId, {
    feature: "whatsapp",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    log("info", "whatsapp_send_blocked", {
      userId,
      reference,
      reason: entitlement.reason,
      type: entitlement.type,
      requiredPlan: entitlement.requiredPlan,
    });
    return;
  }

  const usage = await enforceUsageLimit(userId, "whatsappMessages");
  if (!usage.ok) {
    log("info", "whatsapp_send_blocked", {
      userId,
      reference,
      reason: "limit_reached",
      plan: usage.plan,
      limit: usage.limit,
      used: usage.used,
    });
    return;
  }

  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!profile?.businessPhone) {
    log("info", "whatsapp_payment_skipped_no_phone", { userId, reference });
    return;
  }

  const body = `Payment received via ${provider}: ${currency} ${amount.toFixed(
    2
  )} (ref: ${reference}).`;

  const conversation = await ensureConversationForUserPhone(userId, profile.businessPhone, {
    paymentReference: reference,
  });
  sendWhatsAppText({ to: profile.businessPhone, body })
    .then(async (result: any) => {
      const status = result?.skipped ? "FAILED" : "SENT";
      if (conversation) {
        await recordOutboundMessage({
          conversationId: conversation.id,
          content: body,
          status,
          metaMessageId: result?.messageId,
        });
      }
      if (result?.skipped) {
        log("info", "whatsapp_send_skipped", { reason: "disabled", reference });
        return;
      }
      log("info", "whatsapp_payment_sent", { userId, reference, messageId: result?.messageId });
    })
    .catch(async (error: any) => {
      if (conversation) {
        await recordOutboundMessage({
          conversationId: conversation.id,
          content: body,
          status: "FAILED",
        });
      }
      log("error", "whatsapp_payment_failed", {
        userId,
        reference,
        classification: error?.classification,
        metaCode: error?.metaCode,
        message: error?.message,
      });
    });
}

export async function resolveBusinessIdForUser(userId: string) {
  const owned = await prisma.business.findFirst({
    where: { ownerId: userId },
    select: { id: true },
  });
  if (owned?.id) return owned.id;
  const member = await prisma.businessMember.findFirst({
    where: { userId },
    select: { businessId: true },
  });
  return member?.businessId || null;
}

export async function ensureConversationForUserPhone(
  userId: string,
  phone: string,
  link?: { invoiceNumber?: string; paymentReference?: string }
) {
  const businessId = await resolveBusinessIdForUser(userId);
  if (!businessId) {
    log("warn", "whatsapp_conversation_missing_business", { userId });
    return null;
  }
  const normalized = normalizePhoneNumber(phone);
  const conversation = await prisma.conversation.upsert({
    where: {
      businessId_customerPhone_channel: {
        businessId,
        customerPhone: normalized,
        channel: "whatsapp",
      },
    },
    update: {
      lastMessageAt: new Date(),
    },
    create: {
      businessId,
      customerPhone: normalized,
      channel: "whatsapp",
      status: "OPEN",
      lastMessageAt: new Date(),
    },
  });

  if (link?.invoiceNumber) {
    const invoice = await prisma.invoice.findFirst({
      where: { userId, invoiceNumber: link.invoiceNumber },
      select: { id: true },
    });
    if (invoice?.id) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { invoiceId: invoice.id },
      });
    }
  }

  if (link?.paymentReference) {
    const payment = await prisma.payment.findFirst({
      where: { userId, reference: link.paymentReference },
      select: { id: true },
    });
    if (payment?.id) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { paymentId: payment.id },
      });
    }
  }

  return conversation;
}

export async function recordInboundMessage({
  conversationId,
  content,
  metaMessageId,
  attachments,
}: {
  conversationId: string;
  content: string;
  metaMessageId?: string;
  attachments?: unknown;
}) {
  const attachmentsJson = attachments as Prisma.InputJsonValue | undefined;
  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        direction: "INBOUND",
        source: "WHATSAPP",
        content,
        status: "DELIVERED",
        metaMessageId,
        attachments: attachmentsJson,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastCustomerActivityAt: new Date(),
        status: "OPEN",
        autoClosedAt: null,
      },
    }),
  ]);
}

export async function recordOutboundMessage({
  conversationId,
  content,
  status,
  metaMessageId,
  attachments,
  actorId,
}: {
  conversationId: string;
  content: string;
  status: "SENT" | "DELIVERED" | "FAILED";
  metaMessageId?: string;
  attachments?: unknown;
  actorId?: string | null;
}) {
  const attachmentsJson = attachments as Prisma.InputJsonValue | undefined;
  if (status === "SENT" || status === "DELIVERED") {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { businessId: true, business: { select: { ownerId: true } } },
    });
    if (conversation?.businessId && conversation.business?.ownerId) {
      await recordAnalyticsEvent({
        userId: conversation.business.ownerId,
        workspaceId: conversation.businessId,
        orgId: conversation.businessId,
        type: "WHATSAPP_MESSAGE_SENT",
        count: 1,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        source: "WHATSAPP",
        content,
        status,
        metaMessageId,
        attachments: attachmentsJson,
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    await tx.messageAudit.create({
      data: {
        conversationId,
        messageId: message.id,
        actorId: actorId ?? null,
        action: "SEND",
        status,
      },
    });
  });
}
