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

  const subs = await prisma.subscription.findMany({ where: { userId: session.user.id } });
  return NextResponse.json(subs);
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan, status, renewalDate, trialEndsAt, usageLimit, usagePeriod } =
    subscriptionSchema.parse(await req.json());
  assertRateLimit(`sub:${session.user.id}`, 10, 60_000);
  const sub = await prisma.subscription.create({
    data: {
      userId: session.user.id,
      plan,
      status,
      renewalDate: renewalDate ? new Date(renewalDate) : new Date(),
      trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
      usageLimit,
      usagePeriod,
    },
  });
  return NextResponse.json(sub, { status: 201 });
});

export const PUT = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, status, plan, trialEndsAt, usageLimit, usagePeriod } = await req.json();
  const sub = await prisma.subscription.update({
    where: { id, userId: session.user.id },
    data: { status, plan, trialEndsAt, usageLimit, usagePeriod },
  });
  return NextResponse.json(sub);
});
