import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";
import { prisma } from "@/lib/prisma";
import { enforceEntitlement, enforceUsageLimit, nextPlanAfter } from "@/lib/entitlements";
import { buildAutomationFlowWhere, resolveAutomationScope } from "@/lib/automation/access";
import {
  buildAutomationRelationsFromSteps,
  buildDashboardStepsFromRelations,
} from "@/lib/automation/dashboard-definition";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "ai",
    requiredPlan: "free",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan ?? "free",
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }
  const usage = await enforceUsageLimit(session.user.id, "aiRequests");
  if (!usage.ok) {
    if (usage.code === "payment_required") {
      return NextResponse.json(
        { error: "Payment required", type: "payment_required", reason: "Active subscription required for AI" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: "limit_reached",
        reason: "AI usage limit reached",
        requiredPlan: nextPlanAfter(usage.plan),
        ...usage,
      },
      { status: 403 }
    );
  }

  const { flowId, goal } = await req.json();
  assertRateLimit(`ai:flow-improve:${session.user.id}`);

  const automationScope = await resolveAutomationScope(session.user.id);
  const flow = await prisma.automationFlow.findFirst({
    where: buildAutomationFlowWhere(automationScope, { id: flowId }),
    include: { triggers: true, actions: true },
  });
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await aiRouter({
    mode: "flow-improve",
    prompt: goal,
    context: { flow },
    userId: session.user.id,
  });
  const improved = JSON.parse(json);
  let steps;
  try {
    steps = buildDashboardStepsFromRelations(
      {
        steps: Array.isArray(flow.steps) ? (flow.steps as any[]) : [],
        triggers: improved.trigger
          ? [{ type: improved.trigger.type, config: improved.trigger.config || {} }]
          : (flow.triggers as any[]),
        actions: Array.isArray(improved.actions) ? improved.actions : (flow.actions as any[]),
      },
      { strict: true }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to apply that improvement to a live automation.",
        reason: error instanceof Error ? error.message : "Unsupported automation definition",
      },
      { status: 400 }
    );
  }

  const relations = buildAutomationRelationsFromSteps(steps as any[]);
  const updated = await prisma.automationFlow.update({
    where: { id: flowId },
    data: {
      title: improved.title || flow.title,
      description: improved.description || flow.description,
      steps: steps as any,
      triggers: {
        deleteMany: {},
        create: relations.triggers.map((trigger) => ({
          type: trigger.type,
          config: trigger.config as any,
          conditions: (trigger.conditions ?? {}) as any,
        })),
      },
      actions: {
        deleteMany: {},
        create: relations.actions.map((action) => ({
          type: action.type,
          config: action.config as any,
          order: action.order,
        })),
      },
    },
    include: { triggers: true, actions: true },
  });

  return NextResponse.json(updated);
});
