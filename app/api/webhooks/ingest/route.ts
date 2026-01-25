import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeAutomationRun } from "@/lib/automation/engine";
import { log } from "@/lib/logger";
import {
  enforceEntitlement,
  enforceUsageLimit,
  getUserPlan,
  isPlanAtLeast,
  requiredPlanForSteps,
} from "@/lib/entitlements";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "/";
  const payload = await req.json().catch(() => ({}));

  const triggers = await prisma.trigger.findMany({
    where: { type: "webhook", config: { path: ["path"], equals: path } },
    include: { flow: true },
  });

  for (const trigger of triggers) {
    const userId = trigger.flow.userId;
    const entitlement = await enforceEntitlement(userId, {
      feature: "automations",
      requiredPlan: "starter",
      allowTrial: false,
    });
    if (!entitlement.ok) {
      log("warn", "automation_run_skipped", {
        reason: entitlement.reason,
        type: entitlement.type,
        flowId: trigger.flow.id,
        userId,
      });
      continue;
    }

    const plan = await getUserPlan(userId);
    const required = requiredPlanForSteps((trigger.flow.steps as any[]) || []);
    if (required && !isPlanAtLeast(plan, required.plan)) {
      log("warn", "automation_run_skipped", {
        reason: required.reason,
        requiredPlan: required.plan,
        flowId: trigger.flow.id,
        userId,
      });
      continue;
    }

    const usage = await enforceUsageLimit(userId, "automationRuns");
    if (!usage.ok) {
      log("warn", "automation_run_skipped", {
        reason: usage.code ?? "limit_reached",
        plan: usage.plan,
        limit: usage.limit,
        used: usage.used,
        flowId: trigger.flow.id,
        userId,
      });
      continue;
    }

    await executeAutomationRun(trigger.flow, payload);
  }

  return NextResponse.json({ received: true, triggered: triggers.length });
}

export const dynamic = "force-dynamic";
