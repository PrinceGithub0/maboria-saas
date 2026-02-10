import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { normalizePhoneNumber, recordInboundMessage, resolveBusinessIdForUser } from "@/lib/whatsapp";

export const POST = withErrorHandling(async (req: Request) => {
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

  const body = await req.json().catch(() => ({}));
  const rawPhone = body?.phone || "16505551111";
  const content = body?.message || "Test message from WhatsApp customer.";

  const businessId = await resolveBusinessIdForUser(session.user.id);
  if (!businessId) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const customerPhone = normalizePhoneNumber(rawPhone);
  const conversation = await prisma.conversation.upsert({
    where: {
      businessId_customerPhone_channel: {
        businessId,
        customerPhone,
        channel: "whatsapp",
      },
    },
    update: {
      status: "OPEN",
      lastMessageAt: new Date(),
    },
    create: {
      businessId,
      customerPhone,
      channel: "whatsapp",
      status: "OPEN",
      lastMessageAt: new Date(),
    },
  });

  await recordInboundMessage({
    conversationId: conversation.id,
    content,
  });

  return NextResponse.json({ ok: true, conversationId: conversation.id });
});
