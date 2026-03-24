import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { authOptions } from "@/lib/auth";
import { expireUnifiedConversationSnoozes } from "@/lib/inbox/conversation-participants";
import { requireUnifiedInboxAccess } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await requireUnifiedInboxAccess(session.user.id);
  await expireUnifiedConversationSnoozes(prisma, { tenantId: context.orgId });

  const unreadCount = await prisma.unifiedConversationParticipant.aggregate({
    where: {
      tenantId: context.orgId,
      userId: session.user.id,
    },
    _sum: { unreadCount: true },
  });

  return NextResponse.json({ unreadCount: unreadCount._sum.unreadCount ?? 0 });
});
