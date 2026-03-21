import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { authOptions } from "@/lib/auth";
import { requireUnifiedInboxAccess } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

export const DELETE = withErrorHandling(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await requireUnifiedInboxAccess(session.user.id);
  const { id } = await ctx.params;

  await prisma.cannedReply.deleteMany({
    where: {
      id,
      businessId: context.orgId,
    },
  });

  return NextResponse.json({ ok: true });
});
