import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";
import { prisma } from "@/lib/prisma";
import { enforceUsageLimit, getUserPlan, isPlanAtLeast } from "@/lib/entitlements";

export const POST = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(session.user.id);
  if (!isPlanAtLeast(plan, "pro")) {
    return NextResponse.json({ error: "Upgrade required", requiredPlan: "pro", plan }, { status: 402 });
  }
  const usageLimit = await enforceUsageLimit(session.user.id, "aiRequests");
  if (!usageLimit.ok) {
    return NextResponse.json(
      { error: "Upgrade required", reason: "AI usage limit reached", requiredPlan: "pro", ...usageLimit },
      { status: 402 }
    );
  }

  assertRateLimit(`ai:insight:${session.user.id}`);

  const [runs, usageLogs, subs, invoices] = await Promise.all([
    prisma.automationRun.count({ where: { userId: session.user.id, runStatus: "SUCCESS" } }),
    prisma.aiUsageLog.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.subscription.findMany({ where: { userId: session.user.id } }),
    prisma.invoice.findMany({ where: { userId: session.user.id }, orderBy: { generatedAt: "desc" } }),
  ]);

  const stats = { runs, usageLogs, subs, invoices };
  const json = await aiRouter({
    mode: "insight",
    prompt: "Generate insights",
    context: stats,
    userId: session.user.id,
  });
  const insights = JSON.parse(json);
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "AI_INSIGHT", metadata: insights },
  });
  return NextResponse.json(insights);
});
