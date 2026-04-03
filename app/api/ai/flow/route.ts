import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";
import { prisma } from "@/lib/prisma";
import { enforceEntitlement, enforceFlowLimit, enforceUsageLimit, nextPlanAfter } from "@/lib/entitlements";
import { resolveAutomationScope } from "@/lib/automation/access";
import { getAutomationPermissions, hasAutomationPermission } from "@/lib/automation/permissions";
import { requiresFinancialAutomationPrivilege } from "@/lib/automation/step-policy";
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

  const automationEntitlement = await enforceEntitlement(session.user.id, {
    feature: "automations",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!automationEntitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: automationEntitlement.type,
        requiredPlan: automationEntitlement.requiredPlan ?? "starter",
        reason: automationEntitlement.reason,
      },
      { status: 403 }
    );
  }

  const permissions = await getAutomationPermissions(session.user.id);
  if (!hasAutomationPermission(permissions, "create")) {
    return NextResponse.json(
      {
        error: "Forbidden",
        type: "permission_denied",
        action: "create_automation",
        role: permissions.role,
        requiredRole: "owner_or_admin",
      },
      { status: 403 }
    );
  }

  const flowLimit = await enforceFlowLimit(session.user.id, "automations");
  if (!flowLimit.ok) {
    if (flowLimit.code === "payment_required") {
      return NextResponse.json(
        { error: "Payment required", type: "payment_required", reason: "Active subscription required" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: "limit_reached",
        reason: "Automation limit reached",
        requiredPlan: nextPlanAfter(flowLimit.plan),
        ...flowLimit,
      },
      { status: 402 }
    );
  }

  const { prompt } = await req.json();
  assertRateLimit(`ai:flow:${session.user.id}`);

  const json = await aiRouter({
    mode: "flow-generate",
    prompt,
    userId: session.user.id,
  });

  const flow = JSON.parse(json);
  let steps;
  try {
    steps = buildDashboardStepsFromRelations(
      {
        triggers: flow.trigger ? [{ type: flow.trigger.type, config: flow.trigger.config || {} }] : [],
        actions: Array.isArray(flow.actions) ? flow.actions : [],
      },
      { strict: true }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to generate a live automation from that prompt.",
        reason: error instanceof Error ? error.message : "Unsupported automation definition",
      },
      { status: 400 }
    );
  }

  const relations = buildAutomationRelationsFromSteps(steps as any[]);
  if (requiresFinancialAutomationPrivilege(steps as any[])) {
    if (!hasAutomationPermission(permissions, "refund")) {
      return NextResponse.json(
        {
          error: "Forbidden",
          type: "permission_denied",
          action: "financial_automation",
          role: permissions.role,
          requiredRole: "owner_or_admin",
        },
        { status: 403 }
      );
    }
  }
  const automationScope = await resolveAutomationScope(session.user.id);
  const created = await prisma.automationFlow.create({
    data: {
      userId: automationScope.ownerUserId,
      businessId: automationScope.businessId ?? undefined,
      title: flow.title,
      description: flow.description || flow.title,
      category: typeof flow.category === "string" ? flow.category : undefined,
      steps: steps as any,
      status: "DRAFT",
      triggers: relations.triggers.length
        ? {
            create: relations.triggers.map((trigger) => ({
              type: trigger.type,
              config: trigger.config as any,
              conditions: (trigger.conditions ?? {}) as any,
            })),
          }
        : undefined,
      actions: {
        create: relations.actions.map((action) => ({
          type: action.type,
          config: action.config as any,
          order: action.order,
        })),
      },
    },
  });

  return NextResponse.json(created);
});
