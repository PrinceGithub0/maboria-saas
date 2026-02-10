import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

export const POST = withErrorHandling(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const businesses = await prisma.business.findMany({
    where: { autoCloseEnabled: true },
    select: { id: true, autoCloseAfterHours: true },
  });

  let totalClosed = 0;
  const now = new Date();

  for (const business of businesses) {
    const hours = business.autoCloseAfterHours || 48;
    const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const result = await prisma.conversation.updateMany({
      where: {
        businessId: business.id,
        status: { in: ["OPEN", "PENDING"] },
        lastCustomerActivityAt: { lt: cutoff },
      },
      data: { status: "DONE", autoClosedAt: now },
    });
    totalClosed += result.count;
  }

  return NextResponse.json({ ok: true, totalClosed });
});
