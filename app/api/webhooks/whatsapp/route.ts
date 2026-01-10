import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { normalizePhoneNumber, recordInboundMessage, recordOutboundMessage, sendWhatsAppText } from "@/lib/whatsapp";
import { generateWhatsAppAutoReply } from "@/lib/whatsapp-ai";

const WHATSAPP_CUSTOMER_CHAT_ENABLED = process.env.WHATSAPP_CUSTOMER_CHAT_ENABLED !== "false";
const WHATSAPP_AI_REPLY_ENABLED = process.env.WHATSAPP_AI_REPLY_ENABLED === "true";

// Meta may acknowledge webhooks or outbound sends without showing activity in the dashboard
// until business verification is complete. This is expected and not a system error.

export const GET = async (req: Request) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected) {
    log("info", "whatsapp_webhook_verified");
    return new NextResponse(challenge || "", { status: 200 });
  }

  log("warn", "whatsapp_webhook_verification_failed");
  return new NextResponse("Forbidden", { status: 403 });
};

export const POST = async (req: Request) => {
  if (!WHATSAPP_CUSTOMER_CHAT_ENABLED) {
    log("info", "whatsapp_webhook_skipped", {
      customerChat: WHATSAPP_CUSTOMER_CHAT_ENABLED,
    });
    return NextResponse.json({ received: true, skipped: true });
  }

  const body = await req.json().catch(() => ({}));
  const entry = (body as any)?.entry?.[0];
  const changes = entry?.changes?.[0]?.value;
  const messages = changes?.messages;
  const metadata = changes?.metadata;

  const phoneNumberId = metadata?.phone_number_id as string | undefined;
  const displayPhone = metadata?.display_phone_number as string | undefined;

  const business = phoneNumberId
    ? await prisma.business.findFirst({
        where: { whatsappPhoneNumberId: phoneNumberId },
        select: { id: true, name: true, ownerId: true },
      })
    : null;

  if (!business) {
    log("warn", "whatsapp_webhook_no_business", { phoneNumberId, displayPhone });
    return NextResponse.json({ received: true });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    log("info", "whatsapp_webhook_received", { hasMessages: 0 });
    return NextResponse.json({ received: true });
  }

  for (const msg of messages) {
    const from = msg?.from as string | undefined;
    const text = msg?.text?.body as string | undefined;
    const metaMessageId = msg?.id as string | undefined;
    if (!from || !text) continue;

    let conversationId: string | null = null;
    try {
      const customerPhone = normalizePhoneNumber(from);
      const conversation = await prisma.conversation.upsert({
        where: {
          businessId_customerPhone_channel: {
            businessId: business.id,
            customerPhone,
            channel: "whatsapp",
          },
        },
        update: {
          status: "OPEN",
          lastMessageAt: new Date(),
        },
        create: {
          businessId: business.id,
          customerPhone,
          channel: "whatsapp",
          status: "OPEN",
          lastMessageAt: new Date(),
        },
      });
      conversationId = conversation.id;
      await recordInboundMessage({
        conversationId: conversation.id,
        content: text,
        metaMessageId,
      });
    } catch (error: any) {
      log("error", "whatsapp_inbound_store_failed", { error: error.message });
      continue;
    }

    if (WHATSAPP_AI_REPLY_ENABLED && conversationId) {
      const decision = await generateWhatsAppAutoReply({
        message: text,
        businessName: business.name,
      });
      if (!decision) {
        log("warn", "whatsapp_ai_no_decision", { conversationId });
        continue;
      }
      if (!decision.shouldRespond || decision.confidence < 0.6) {
        log("info", "whatsapp_ai_escalated", {
          conversationId,
          confidence: decision.confidence,
          reason: decision.reason,
        });
        continue;
      }

      try {
        const result: any = await sendWhatsAppText({
          to: normalizePhoneNumber(from),
          body: decision.reply || "",
        });
        await recordOutboundMessage({
          conversationId,
          content: decision.reply || "",
          status: result?.skipped ? "FAILED" : "SENT",
          metaMessageId: result?.messageId,
        });
      } catch (error: any) {
        await recordOutboundMessage({
          conversationId,
          content: decision.reply || "",
          status: "FAILED",
        });
        log("error", "whatsapp_ai_reply_failed", {
          conversationId,
          message: error?.message,
          classification: error?.classification,
          metaCode: error?.metaCode,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
};
