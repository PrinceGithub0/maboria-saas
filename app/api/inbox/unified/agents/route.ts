import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireUnifiedInboxAccess } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);

  const members = await prisma.businessMember.findMany({
    where: {
      businessId: context.orgId,
      status: "active",
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      role: true,
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return NextResponse.json({
    items: members.map((member) => ({
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
    })),
  });
});
