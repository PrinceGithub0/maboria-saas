import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { authOptions } from "@/lib/auth";
import { requireUnifiedInboxAccess } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await requireUnifiedInboxAccess(session.user.id);

  const unreadCount = await prisma.unifiedMessage.count({
    where: {
      tenantId: context.orgId,
      direction: "INBOUND",
      channel: { in: ["EMAIL", "WHATSAPP"] },
    },
  });

  return NextResponse.json({ unreadCount });
});
