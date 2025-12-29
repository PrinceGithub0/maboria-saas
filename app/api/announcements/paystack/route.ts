import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

const ACTION_KEY = "ANNOUNCEMENT_PAYSTACK_DISMISSED";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.activityLog.findFirst({
    where: { userId: session.user.id, action: ACTION_KEY },
    select: { id: true },
  });
  return NextResponse.json({ dismissed: Boolean(existing) });
});

export const POST = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.activityLog.findFirst({
    where: { userId: session.user.id, action: ACTION_KEY },
    select: { id: true },
  });
  if (!existing) {
    await prisma.activityLog.create({
      data: { userId: session.user.id, action: ACTION_KEY, metadata: { source: "dashboard" } },
    });
  }

  return NextResponse.json({ dismissed: true });
});
