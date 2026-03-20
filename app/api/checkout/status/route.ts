import "server-only";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { z } from "zod";
import { requireOrgPermission } from "@/lib/org-auth";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const reference = z.string().min(6).parse(searchParams.get("reference"));

  const checkout = await prisma.checkoutSession.findUnique({
    where: { reference },
    select: { status: true, provider: true, plan: true, billingCycle: true, currency: true, amount: true, userId: true },
  });
  if (!checkout) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let scopedUserId = session.user.id;
  if (checkout.userId !== session.user.id) {
    const access = await requireOrgPermission(session.user.id, {
      permission: "subscription:manage",
      requireActiveSubscription: false,
    });
    if (!access.ok || access.context.ownerUserId !== checkout.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    scopedUserId = access.context.ownerUserId;
  }

  const subscription = await prisma.subscription.findFirst({
    where: { userId: scopedUserId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { status: true, plan: true },
  });

  return NextResponse.json({
    checkout: {
      status: checkout.status,
      provider: checkout.provider,
      plan: checkout.plan,
      billingCycle: checkout.billingCycle,
      currency: checkout.currency,
      amount: checkout.amount,
    },
    subscription,
  });
});
