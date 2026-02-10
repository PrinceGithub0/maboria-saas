import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
