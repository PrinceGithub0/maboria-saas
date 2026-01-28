import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { subscriptionSchema } from "@/lib/validators";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.user.role === "ADMIN") {
    return NextResponse.json([
      {
        id: "admin-override",
        userId: session.user.id,
        plan: "ENTERPRISE",
        status: "ACTIVE",
        renewalDate: new Date().toISOString(),
        usageLimit: null,
        usagePeriod: "monthly",
        currency: "USD",
        graceEndsAt: null,
        cancellationReason: null,
        overageUsed: 0,
        interval: "monthly",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        invoices: [],
        receiptUrl: null,
        receiptNumber: null,
        receiptIssuedAt: null,
        lastPaymentReference: null,
        lastPaymentProvider: null,
      },
    ]);
  }

  const subs = await prisma.subscription.findMany({ where: { userId: session.user.id } });
  return NextResponse.json(subs);
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { plan, status, renewalDate, usageLimit, usagePeriod } = subscriptionSchema.parse(await req.json());
  assertRateLimit(`sub:${session.user.id}`, 10, 60_000);
  const sub = await prisma.subscription.create({
    data: {
      userId: session.user.id,
      plan,
      status,
      renewalDate: renewalDate ? new Date(renewalDate) : new Date(),
      usageLimit,
      usagePeriod,
    },
  });
  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "SUBSCRIPTION_CREATED",
      resourceType: "subscription",
      resourceId: sub.id,
      metadata: { plan, status },
    },
  });
  return NextResponse.json(sub, { status: 201 });
});

export const PUT = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, status, plan, usageLimit, usagePeriod } = await req.json();
  const sub = await prisma.subscription.update({
    where: { id, userId: session.user.id },
    data: { status, plan, usageLimit, usagePeriod },
  });
  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "SUBSCRIPTION_UPDATED",
      resourceType: "subscription",
      resourceId: sub.id,
      metadata: { plan: sub.plan, status: sub.status },
    },
  });
  return NextResponse.json(sub);
});
