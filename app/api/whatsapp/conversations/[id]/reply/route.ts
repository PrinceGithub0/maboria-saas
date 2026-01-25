import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { recordOutboundMessage, sendWhatsAppText, resolveBusinessIdForUser } from "@/lib/whatsapp";

const replySchema = z.object({
  message: z.string().min(1),
});

export const POST = withErrorHandling(async (req: Request, ctx: { params: { id: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const businessId = await resolveBusinessIdForUser(session.user.id);
  if (!businessId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = replySchema.parse(body);

  const conversation = await prisma.conversation.findFirst({
    where: { id: ctx.params.id, businessId },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result: any = await sendWhatsAppText({
      to: conversation.customerPhone,
      body: parsed.message,
    });

    await recordOutboundMessage({
      conversationId: conversation.id,
      content: parsed.message,
      status: result?.skipped ? "FAILED" : "SENT",
      metaMessageId: result?.messageId,
    });

    return NextResponse.json({
      ok: true,
      messageId: result?.messageId,
      skipped: result?.skipped,
    });
  } catch (error: any) {
    await recordOutboundMessage({
      conversationId: conversation.id,
      content: parsed.message,
      status: "FAILED",
    });
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "WhatsApp send failed",
        classification: error?.classification || "unknown",
      },
      { status: error?.status || 500 }
    );
  }
});
