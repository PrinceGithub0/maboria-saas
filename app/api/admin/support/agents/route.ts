import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const access = await requireVerifiedPlatformAdminAccess({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (!access.ok) {
    return access.response;
  }

  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: {
        in: ["OPS_ADMIN"],
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });
  return NextResponse.json({ items: users });
});
