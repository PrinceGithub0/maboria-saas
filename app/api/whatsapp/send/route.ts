import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { assertRateLimit } from "@/lib/rate-limit";
import { enforceEntitlement, enforceUsageLimit, nextPlanAfter } from "@/lib/entitlements";
import {
  ensureConversationForUserPhone,
  recordOutboundMessage,
  sendWhatsAppTemplate,
  sendWhatsAppText,
} from "@/lib/whatsapp";

const payloadSchema = z
  .object({
    to: z.string().min(5),
    type: z.enum(["text", "template"]),
    message: z.string().min(1).optional(),
    templateName: z.string().min(1).optional(),
    language: z.string().min(2).optional(),
    components: z.array(z.record(z.string(), z.any())).optional(),
  })
  .refine((data) => (data.type === "text" ? Boolean(data.message) : true), {
    message: "message is required for text",
    path: ["message"],
  })
  .refine((data) => (data.type === "template" ? Boolean(data.templateName) : true), {
    message: "templateName is required for template",
    path: ["templateName"],
  });

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (process.env.WHATSAPP_CUSTOMER_CHAT_ENABLED === "false") {
    return NextResponse.json({ ok: false, skipped: true, reason: "chat_disabled" }, { status: 403 });
  }

  assertRateLimit(`whatsapp:${session.user.id}`, 20, 60_000);

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "whatsapp",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const usage = await enforceUsageLimit(session.user.id, "whatsappMessages", false);
  if (!usage.ok) {
    const requiredPlan = nextPlanAfter(usage.plan);
    return NextResponse.json(
      {
        error: "Usage limit reached",
        type: "limit_reached",
        requiredPlan,
        plan: usage.plan,
        limit: usage.limit,
        used: usage.used,
      },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = payloadSchema.parse(body);

  const conversation = await ensureConversationForUserPhone(session.user.id, parsed.to);

  try {
    if (parsed.type === "text") {
      const result: any = await sendWhatsAppText({
        to: parsed.to,
        body: parsed.message || "",
      });
      if (conversation) {
        await recordOutboundMessage({
          conversationId: conversation.id,
          content: parsed.message || "",
          status: result?.skipped ? "FAILED" : "SENT",
          metaMessageId: result?.messageId,
        });
      }
      return NextResponse.json({ ok: true, skipped: result?.skipped, messageId: result?.messageId });
    }

    const result: any = await sendWhatsAppTemplate({
      to: parsed.to,
      name: parsed.templateName || "",
      language: parsed.language || "en_US",
      components: parsed.components,
    });
    if (conversation) {
      await recordOutboundMessage({
        conversationId: conversation.id,
        content: `TEMPLATE:${parsed.templateName}`,
        status: result?.skipped ? "FAILED" : "SENT",
        metaMessageId: result?.messageId,
      });
    }
    return NextResponse.json({ ok: true, skipped: result?.skipped, messageId: result?.messageId });
  } catch (error: any) {
    if (conversation) {
      await recordOutboundMessage({
        conversationId: conversation.id,
        content: parsed.message || `TEMPLATE:${parsed.templateName}`,
        status: "FAILED",
      });
    }
    const status = error?.status || 500;
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "WhatsApp send failed",
        classification: error?.classification || "unknown",
        metaCode: error?.metaCode,
      },
      { status }
    );
  }
});
