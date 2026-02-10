import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { resolveBusinessIdForUser, sendWhatsAppText } from "@/lib/whatsapp";

export const POST = withErrorHandling(async (_req: Request, ctx: { params: { id: string } }) => {
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
  if (!businessId) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const message = await prisma.message.findFirst({
    where: { id: ctx.params.id, direction: "OUTBOUND", conversation: { businessId } },
    include: { conversation: { select: { id: true, customerPhone: true } } },
  });
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result: any = await sendWhatsAppText({
      to: message.conversation.customerPhone,
      body: message.content,
    });

    await prisma.$transaction([
      prisma.message.update({
        where: { id: message.id },
        data: { status: result?.skipped ? "FAILED" : "SENT", metaMessageId: result?.messageId || null },
      }),
      prisma.messageAudit.create({
        data: {
          conversationId: message.conversation.id,
          messageId: message.id,
          actorId: session.user.id,
          action: "RETRY",
          status: result?.skipped ? "FAILED" : "SENT",
        },
      }),
    ]);

    return NextResponse.json({ ok: true, skipped: result?.skipped });
  } catch (error: any) {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "FAILED" },
    });
    await prisma.messageAudit.create({
      data: {
        conversationId: message.conversation.id,
        messageId: message.id,
        actorId: session.user.id,
        action: "RETRY",
        status: "FAILED",
      },
    });
    return NextResponse.json({ ok: false, error: error?.message || "WhatsApp send failed" }, { status: error?.status || 500 });
  }
});
