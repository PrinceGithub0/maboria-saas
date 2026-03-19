import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { requirePlatformAdmin } from "@/lib/admin/admin-rbac";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }, { status: 401 });
  const denied = requirePlatformAdmin(session.user);
  if (denied) return denied;

  const byProvider = await prisma.webhookEvent.groupBy({
    by: ["provider", "status"],
    _count: { _all: true },
  });

  const totals = await prisma.webhookEvent.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  return NextResponse.json({
    totals: totals.map((row) => ({ status: row.status, count: row._count._all })),
    providers: byProvider.map((row) => ({
      provider: row.provider,
      status: row.status,
      count: row._count._all,
    })),
  });
});
