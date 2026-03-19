import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireUnifiedInboxAccess } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;

  if (!since || Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Invalid since timestamp." }, { status: 422 });
  }

  const [conversations, messages] = await Promise.all([
    prisma.unifiedConversation.findMany({
      where: {
        tenantId: context.orgId,
        updatedAt: { gt: since },
      },
      select: {
        id: true,
        status: true,
        assignedUserId: true,
        lastMessageAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "asc" },
      take: 250,
    }),
    prisma.unifiedMessage.findMany({
      where: {
        tenantId: context.orgId,
        createdAt: { gt: since },
      },
      select: {
        id: true,
        conversationId: true,
        direction: true,
        channel: true,
        deliveryStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
  ]);

  return NextResponse.json({
    now: new Date().toISOString(),
    conversations,
    messages,
  });
});
