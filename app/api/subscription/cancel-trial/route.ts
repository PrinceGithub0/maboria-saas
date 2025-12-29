import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { log } from "@/lib/logger";

export const POST = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const trial = await prisma.subscription.findFirst({
    where: { userId: session.user.id, status: "TRIALING" },
    orderBy: { createdAt: "desc" },
  });

  if (!trial) {
    return NextResponse.json({ error: "No active trial found." }, { status: 404 });
  }

  const now = new Date();
  const updated = await prisma.subscription.update({
    where: { id: trial.id },
    data: {
      status: "CANCELED",
      trialEndsAt: now,
      renewalDate: now,
      cancellationReason: "Trial canceled by user",
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "TRIAL_CANCELED",
      metadata: { subscriptionId: updated.id },
    },
  });

  log("info", "trial_canceled", { userId: session.user.id, subscriptionId: updated.id });

  return NextResponse.json({ success: true });
});

export const dynamic = "force-dynamic";
