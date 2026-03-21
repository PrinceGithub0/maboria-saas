import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { workflowSchema } from "@/lib/validators";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement, getUserPlan, isPlanAtLeast, requiredPlanForSteps } from "@/lib/entitlements";
import { buildAutomationFlowWhere, resolveAutomationScope } from "@/lib/automation/access";

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
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

  const { id } = await params;
  const automationScope = await resolveAutomationScope(session.user.id);
  const workflow = await prisma.automationFlow.findFirst({
    where: buildAutomationFlowWhere(automationScope, { id }),
    include: { triggers: true, actions: true },
  });
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(workflow);
});

export const PUT = withErrorHandling(async (req: Request, { params }: Params) => {
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
  const { id } = await params;
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

  const existing = await prisma.automationFlow.findFirst({
    where: buildAutomationFlowWhere(automationScope, { id }),
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.automationFlow.update({
    where: { id: existing.id },
    data: {
      title: parsed.title,
      description: parsed.description,
      status: parsed.status as any,
      steps: parsed.actions as any,
      triggers: {
        deleteMany: {},
        create: parsed.triggers as any,
      },
      actions: {
        deleteMany: {},
        create: parsed.actions as any,
      },
    },
    include: { triggers: true, actions: true },
  });
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (_req: Request, { params }: Params) => {
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

  const { id } = await params;
  const automationScope = await resolveAutomationScope(session.user.id);
  const existing = await prisma.automationFlow.findFirst({
    where: buildAutomationFlowWhere(automationScope, { id }),
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ success: true });
  }

  await prisma.automationFlow.delete({ where: { id: existing.id } });
  return NextResponse.json({ success: true });
});
