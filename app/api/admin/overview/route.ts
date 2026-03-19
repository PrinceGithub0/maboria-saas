import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const denied = requirePlatformAdmin(session?.user);
  if (denied) return denied;
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session!.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const [totalUsers, totalPayments, revenueByProvider, automationErrors, tickets, pendingRuns, aiMemories] =
    await Promise.all([
      prisma.user.count(),
      prisma.payment.aggregate({ _sum: { amount: true } }),
      prisma.payment.groupBy({
        by: ["provider"],
        _sum: { amount: true },
      }),
      prisma.automationRun.count({ where: { runStatus: "FAILED" } }),
      prisma.supportTicket.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.automationRun.count({ where: { runStatus: "PENDING" } }),
      prisma.aiMemory.count(),
    ]);

  return NextResponse.json({
    totalUsers,
    totalRevenue: Number(totalPayments._sum.amount || 0),
    revenueByProvider: revenueByProvider.map((r) => ({
      ...r,
      _sum: { amount: Number(r._sum.amount || 0) },
    })),
    automationErrors,
    tickets,
    pendingRuns,
    aiMemories,
  });
}
