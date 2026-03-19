import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  createOrResolveCustomerForInbound,
  decryptInboxCredentials,
  logChannelFailure,
  markMessageDeliveryByExternalId,
  parseSenderPhone,
  verifyWhatsAppSignature,
} from "@/lib/inbox/channels";
import { emitUnifiedInboxEvent } from "@/lib/inbox/events";
import { ensureDefaultUnifiedInboxes, writeUnifiedAuditEvent } from "@/lib/inbox/unified";
import { log } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { requireSystemFlag } from "@/lib/system-flags-guard";

export const runtime = "nodejs";

function parseWebhookRateLimit() {
  const raw = Number(process.env.WEBHOOK_RATE_LIMIT || 240);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 240;
}

function safeTokenCompare(expected: string, actual: string) {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.INBOX_INBOUND_TOKEN;
  if (mode === "subscribe" && expected && safeTokenCompare(expected, String(token || ""))) {
    return new NextResponse(challenge || "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const ingestDisabled = await requireSystemFlag(
    "webhooks_ingest_enabled",
    "Webhook ingest is currently disabled."
  );
  if (ingestDisabled) return ingestDisabled;

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  let payload: any = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const entry = payload?.entry?.[0];
  const changes = entry?.changes?.[0]?.value;
  const metadata = changes?.metadata;
  const phoneNumberId = String(metadata?.phone_number_id || "").trim();
  if (!phoneNumberId) return NextResponse.json({ received: true, ignored: "missing_phone_number_id" });

  const business = await prisma.business.findFirst({
    where: { whatsappPhoneNumberId: phoneNumberId },
    select: { id: true, ownerId: true },
  });
  if (!business) return NextResponse.json({ received: true, ignored: "tenant_not_found" });
  assertRateLimit(`unified-whatsapp-webhook:${business.id}`, parseWebhookRateLimit(), 60_000);

  const { whatsapp } = await ensureDefaultUnifiedInboxes(business.id);
  const creds = decryptInboxCredentials(whatsapp.credentialsEncrypted);
  const appSecret = creds.whatsapp?.appSecret || "";
  if (!appSecret) {
    await logChannelFailure({
      tenantId: business.id,
      actionType: "webhook.failure",
      metadata: { provider: "whatsapp", reason: "missing_app_secret" },
    });
    return NextResponse.json({ error: "Missing app secret." }, { status: 401 });
  }
  if (!verifyWhatsAppSignature({ rawBody, signatureHeader: signature, appSecret })) {
    await logChannelFailure({
      tenantId: business.id,
      actionType: "webhook.failure",
      metadata: { provider: "whatsapp", reason: "invalid_signature" },
    });
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const statuses = Array.isArray(changes?.statuses) ? changes.statuses : [];
  for (const status of statuses) {
    const externalId = String(status?.id || "").trim();
    const state = String(status?.status || "").toLowerCase();
    if (!externalId || !state) continue;
    const mapped =
      state === "read"
        ? "READ"
        : state === "delivered"
          ? "DELIVERED"
          : state === "sent"
            ? "SENT"
            : state === "failed"
              ? "FAILED"
              : null;
    if (!mapped) continue;
    await markMessageDeliveryByExternalId({
      inboxId: whatsapp.id,
      externalId,
      status: mapped,
      errorCode: mapped === "FAILED" ? String(status?.errors?.[0]?.code || "delivery_failed") : null,
      errorMessage: mapped === "FAILED" ? String(status?.errors?.[0]?.title || "Delivery failed") : null,
    });
  }

  const messages = Array.isArray(changes?.messages) ? changes.messages : [];
  for (const message of messages) {
    const externalId = String(message?.id || "").trim();
    const phone = parseSenderPhone(String(message?.from || ""));
    const text = String(message?.text?.body || "").trim();
    const profileName = String(changes?.contacts?.[0]?.profile?.name || "").trim() || null;
    if (!externalId || !phone || !text) continue;

    const customer = await createOrResolveCustomerForInbound({
      tenantId: business.id,
      ownerId: business.ownerId,
      channel: "WHATSAPP",
      phone,
      displayName: profileName,
    });

    const existingConversation = await prisma.unifiedConversation.findFirst({
      where: {
        tenantId: business.id,
        inboxId: whatsapp.id,
        contactId: customer.id,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    const conversation =
      existingConversation ||
      (await prisma.unifiedConversation.create({
        data: {
          tenantId: business.id,
          inboxId: whatsapp.id,
          contactId: customer.id,
          status: "OPEN",
          lastMessageAt: new Date(),
        },
        select: { id: true },
      }));

    try {
      let createdMessageId: string | null = null;
      await prisma.$transaction(async (tx) => {
        const created = await tx.unifiedMessage.create({
          data: {
            tenantId: business.id,
            conversationId: conversation.id,
            inboxId: whatsapp.id,
            direction: "INBOUND",
            channel: "WHATSAPP",
            externalId,
            senderIdentifier: phone,
            content: text,
            deliveryStatus: "DELIVERED",
          },
        });

        await tx.unifiedConversation.update({
          where: { id: conversation.id },
          data: {
            status: "OPEN",
            lastMessageAt: created.createdAt,
          },
        });

        await writeUnifiedAuditEvent(tx, {
          tenantId: business.id,
          actionType: "inbound.received",
          conversationId: conversation.id,
          messageId: created.id,
          metadata: {
            provider: "whatsapp",
            externalId,
          },
        });
        createdMessageId = created.id;
      });
      if (createdMessageId) {
        await emitUnifiedInboxEvent({
          tenantId: business.id,
          type: "message.received",
          conversationId: conversation.id,
          metadata: {
            provider: "whatsapp",
            externalId,
            messageId: createdMessageId,
          },
        });
      }
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      log("error", "unified_whatsapp_webhook_store_failed", {
        tenantId: business.id,
        error: error?.message,
      });
    }
  }

  return NextResponse.json({ received: true });
}
