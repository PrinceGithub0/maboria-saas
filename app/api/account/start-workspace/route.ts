import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgContext } from "@/lib/org-auth";
import { withErrorHandling } from "@/lib/api-handler";
import { assertRateLimit } from "@/lib/rate-limit";

const startWorkspaceSchema = z.object({
  planIntent: z.enum(["starter", "pro", "growth", "business"]),
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existingContext = await resolveOrgContext(session.user.id);
  if (existingContext) {
    return NextResponse.json({ redirectTo: "/dashboard" }, { status: 200 });
  }

  const latestActiveSubscription = await prisma.subscription.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  if (latestActiveSubscription) {
    return NextResponse.json({ redirectTo: "/dashboard/onboarding" }, { status: 200 });
  }

  const parsed = startWorkspaceSchema.parse(await req.json());
  assertRateLimit(`start-workspace:${session.user.id}`, 10, 60_000);

  const plan =
    parsed.planIntent === "starter"
      ? "STARTER"
      : parsed.planIntent === "pro"
        ? "PRO"
        : parsed.planIntent === "growth"
          ? "GROWTH"
          : "BUSINESS";

  const now = new Date();
  const existingSubscription = await prisma.subscription.findFirst({
    where: { userId: session.user.id },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });

  if (existingSubscription) {
    await prisma.subscription.update({
      where: { id: existingSubscription.id },
      data: {
        plan,
        status: "INCOMPLETE",
        renewalDate: now,
        autoRenew: true,
        interval: "monthly",
        usagePeriod: "monthly",
        pendingPlan: null,
        pendingEffectiveAt: null,
        cancellationReason: null,
      },
    });
  } else {
    await prisma.subscription.create({
      data: {
        userId: session.user.id,
        plan,
        status: "INCOMPLETE",
        renewalDate: now,
        autoRenew: true,
        interval: "monthly",
        usagePeriod: "monthly",
      },
    });
  }

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "PLAN_INTENT",
      metadata: { plan, source: "start_workspace", autoRenew: true },
    },
  });

  return NextResponse.json({ success: true, redirectTo: "/checkout" }, { status: 200 });
});
