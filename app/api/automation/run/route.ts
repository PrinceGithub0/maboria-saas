import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { executeAutomationRun } from "@/lib/automation/engine";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";
import { enforceUsageLimit, getUserPlan, isPlanAtLeast } from "@/lib/entitlements";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { flowId, input } = await req.json();
  assertRateLimit(`run:${session.user.id}`);

  const usage = await enforceUsageLimit(session.user.id, "automationRuns");
  if (!usage.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        reason: "Automation run limit reached for this month",
        requiredPlan: usage.plan === "free" ? "starter" : "pro",
        plan: usage.plan,
        limit: usage.limit,
        used: usage.used,
      },
      { status: 402 }
    );
  }

  const flow = await prisma.automationFlow.findUnique({ where: { id: flowId } });
  if (!flow || flow.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = await getUserPlan(session.user.id);
  const steps = (flow.steps as any[]) || [];
  const usesAi = steps.some((s) => s?.type === "aiTransform");
  const usesWhatsApp = steps.some((s) => s?.type === "sendWhatsApp");

  if ((usesAi || usesWhatsApp) && !isPlanAtLeast(plan, "pro")) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        requiredPlan: "pro",
        plan,
        reason: usesWhatsApp ? "WhatsApp automation is a Pro feature" : "AI steps are a Pro feature",
      },
      { status: 402 }
    );
  }

  const result = await executeAutomationRun(flow, input || {});
  if ((result as any).status === "FAILED") {
    if (isPlanAtLeast(plan, "pro")) {
      const diagnosis = await aiRouter({
        mode: "diagnose",
        prompt: "Diagnose automation failure",
        context: { flow, logs: result.logs },
        userId: session.user.id,
      });
      return NextResponse.json({ status: result.status, logs: result.logs, diagnosis });
    }
    return NextResponse.json({ status: result.status, logs: result.logs });
  }
  return NextResponse.json({ status: result.status, logs: result.logs });
});
