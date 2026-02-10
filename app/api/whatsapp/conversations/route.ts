import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { resolveBusinessIdForUser } from "@/lib/whatsapp";

export const GET = withErrorHandling(async () => {
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
    return NextResponse.json({ conversations: [] });
  }

  const conversations = await prisma.conversation.findMany({
    where: { businessId },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return NextResponse.json(
    conversations.map((conv) => ({
      id: conv.id,
      customerPhone: conv.customerPhone,
      status: conv.status,
      customerName: conv.customerName,
      tags: conv.tags,
      internalNotes: conv.internalNotes,
      assignedTo: conv.assignedTo,
      isTyping: conv.isTyping,
      typingAt: conv.typingAt,
      lastMessageAt: conv.lastMessageAt,
      lastReadAt: conv.lastReadAt,
      lastCustomerActivityAt: conv.lastCustomerActivityAt,
      channel: conv.channel,
      invoiceId: conv.invoiceId,
      paymentId: conv.paymentId,
      customerId: conv.customerId,
      lastMessage: conv.messages[0] || null,
    }))
  );
});
