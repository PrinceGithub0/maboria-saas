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

  const [mrrUsd, mrrNgn, activeSubs, trials, failed] = await Promise.all([
    prisma.subscription.aggregate({
      where: { status: "ACTIVE", currency: "USD" },
      _count: { _all: true },
    }),
    prisma.subscription.aggregate({
      where: { status: "ACTIVE", currency: "NGN" },
      _count: { _all: true },
    }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: "TRIALING" } }),
    prisma.payment.count({ where: { status: "FAILED" } }),
  ]);

  const revenueByCurrency = await prisma.payment.groupBy({
    by: ["currency"],
    _sum: { amount: true },
  });

  return NextResponse.json({
    mrrUsd: mrrUsd._count._all,
    mrrNgn: mrrNgn._count._all,
    activeSubs,
    trials,
    failedPayments: failed,
    revenueByCurrency: revenueByCurrency.map((r) => ({ currency: r.currency, amount: Number(r._sum.amount) })),
  });
});
