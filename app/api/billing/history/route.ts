import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { requireBillingAccess } from "@/lib/permissions";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireBillingAccess(session.user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: 403 });
  }
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Number(url.searchParams.get("pageSize") || 20);
  const skip = (page - 1) * pageSize;
  const status = url.searchParams.get("status") || undefined;
  const currency = url.searchParams.get("currency") || undefined;

  const [payments, invoices] = await Promise.all([
    prisma.payment.findMany({
      where: { userId: access.ownerUserId, status: status ? (status as any) : undefined, currency: currency || undefined },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.invoice.findMany({
      where: { userId: access.ownerUserId, status: status ? (status as any) : undefined, currency: currency || undefined },
      orderBy: { generatedAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    invoices: invoices.map((i) => ({ ...i, total: Number(i.total) })),
    page,
    pageSize,
  });
});
