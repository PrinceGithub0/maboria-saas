import "server-only";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { z } from "zod";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const reference = z.string().min(6).parse(searchParams.get("reference"));

  const checkout = await prisma.checkoutSession.findFirst({
    where: { reference, userId: session.user.id },
    select: { status: true, provider: true, plan: true, billingCycle: true },
  });
  if (!checkout) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const subscription = await prisma.subscription.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { status: true, plan: true },
  });

  return NextResponse.json({
    checkout,
    subscription,
  });
});
