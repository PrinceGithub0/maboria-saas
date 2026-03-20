import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { workflowSchema } from "@/lib/validators";
import { withErrorHandling } from "@/lib/api-handler";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  enforceEntitlement,
  flowLimits,
  getWorkspaceScope,
  getUserPlan,
  isPlanAtLeast,
  requiredPlanForSteps,
} from "@/lib/entitlements";
import { buildAutomationFlowWhere, resolveAutomationScope } from "@/lib/automation/access";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "workflows",
    requiredPlan: "enterprise",
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
  const workflows = await prisma.automationFlow.findMany({
    where: buildAutomationFlowWhere(automationScope),
    include: { triggers: true, actions: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(workflows);
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "workflows",
    requiredPlan: "enterprise",
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
  const parsed = workflowSchema.parse(body);
  assertRateLimit(`workflow:${session.user.id}`);
  const automationScope = await resolveAutomationScope(session.user.id);

  const plan = await getUserPlan(session.user.id);
  const required = requiredPlanForSteps([...(parsed.triggers as any[]), ...(parsed.actions as any[])]);
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

  const limitValue = flowLimits[plan].workflows ?? null;
  const workflowFilter = {
    OR: [{ triggers: { some: {} } }, { actions: { some: {} } }],
  };
  const scope = await getWorkspaceScope(session.user.id);
  const lockKey = scope.businessId ?? session.user.id;

  const result = await prisma.$transaction(async (tx) => {
    if (limitValue != null) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const used = await tx.automationFlow.count({
        where: { userId: { in: scope.userIds }, ...workflowFilter },
      });
      if (used >= limitValue) {
        return {
          error: "Limit reached",
          type: "limit_reached" as const,
          category: "workflows",
          plan,
          limit: limitValue,
          used,
        };
      }
    }

    const flow = await tx.automationFlow.create({
      data: {
        userId: automationScope.ownerUserId,
        businessId: automationScope.businessId ?? undefined,
        title: parsed.title,
        description: parsed.description,
        status: parsed.status as any,
        steps: parsed.actions as any, // optional legacy storage
        triggers: { create: parsed.triggers as any },
        actions: { create: parsed.actions as any },
      },
      include: { triggers: true, actions: true },
    });
    return { flow };
  });

  if ((result as any).error) {
    return NextResponse.json(result, { status: 402 });
  }

  return NextResponse.json((result as any).flow, { status: 201 });
});
