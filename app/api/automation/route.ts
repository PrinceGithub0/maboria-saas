import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { automationFlowSchema } from "@/lib/validators";
import { withErrorHandling } from "@/lib/api-handler";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  enforceEntitlement,
  flowLimits,
  getUserPlan,
  getWorkspaceScope,
  isPlanAtLeast,
  nextPlanAfter,
  requiredPlanForSteps,
} from "@/lib/entitlements";
import { buildAutomationFlowWhere, resolveAutomationScope } from "@/lib/automation/access";
import { getAutomationPermissions, hasAutomationPermission } from "@/lib/automation/permissions";
import { requiresFinancialAutomationPrivilege } from "@/lib/automation/step-policy";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "automations",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Access denied",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const automationScope = await resolveAutomationScope(session.user.id);
  const flows = await prisma.automationFlow.findMany({
    where: buildAutomationFlowWhere(automationScope),
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(flows);
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "automations",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Access denied",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = automationFlowSchema.parse(body);
  const requestedStatus = String(parsed.status || "DRAFT").toUpperCase();
  assertRateLimit(`automation:${session.user.id}`);

  if (requiresFinancialAutomationPrivilege((parsed.steps as any[]) || [])) {
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

  const plan = await getUserPlan(session.user.id);
  const required = requiredPlanForSteps((parsed.steps as any[]) || []);
  if (required && !isPlanAtLeast(plan, required.plan)) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: "upgrade_required",
        requiredPlan: required.plan,
        plan,
        reason: required.reason,
      },
      { status: 402 }
    );
  }

  const limitValue = flowLimits[plan].automations ?? null;
  const scope = await getWorkspaceScope(session.user.id);
  const lockKey = scope.businessId ?? session.user.id;

  const result = await prisma.$transaction(async (tx) => {
    if (limitValue != null) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const activeUsed = await tx.automationFlow.count({
        where: { userId: { in: scope.userIds }, status: "ACTIVE" },
      });
      if (requestedStatus === "ACTIVE" && activeUsed >= limitValue) {
        return {
          error: "Limit reached",
          type: "limit_reached" as const,
          category: "active_automations",
          requiredPlan: nextPlanAfter(plan),
          plan,
          limit: limitValue,
          used: activeUsed,
        };
      }
    }
    const flow = await tx.automationFlow.create({
      data: {
        userId: permissions.ownerUserId,
        businessId: permissions.businessId ?? undefined,
        title: parsed.title,
        description: parsed.description,
        steps: parsed.steps as any,
        status: parsed.status as any,
      },
    });
    return { flow };
  });

  if ((result as any).error) {
    return NextResponse.json(result, { status: 402 });
  }

  const flow = (result as any).flow;

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "AUTOMATION_CREATED",
      metadata: { flowId: flow.id },
    },
  });

  return NextResponse.json(flow, { status: 201 });
});
