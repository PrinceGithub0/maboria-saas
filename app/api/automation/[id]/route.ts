import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { automationFlowSchema } from "@/lib/validators";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement, getUserPlan, isPlanAtLeast, requiredPlanForSteps } from "@/lib/entitlements";

type Params = { params?: { id?: string } };

const resolveFlowId = (req: Request, params?: { id?: string }) => {
  const fromParams = params?.id;
  if (fromParams && fromParams !== "undefined" && fromParams !== "null") {
    return fromParams;
  }
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const fallback = segments[segments.length - 1];
    if (fallback && fallback !== "undefined" && fallback !== "null") {
      return fallback;
    }
  } catch {
    // ignore parsing errors
  }
  return "";
};

export const GET = withErrorHandling(async (req: Request, { params }: Params) => {
  const flowId = resolveFlowId(req, params);
  if (!flowId || flowId === "undefined") {
    return NextResponse.json({ error: "Invalid automation id" }, { status: 400 });
  }

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

  const flow = await prisma.automationFlow.findFirst({
    where: { id: flowId, userId: session.user.id },
  });
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(flow);
});

export const PUT = withErrorHandling(async (req: Request, { params }: Params) => {
  const flowId = resolveFlowId(req, params);
  if (!flowId || flowId === "undefined") {
    return NextResponse.json({ error: "Invalid automation id" }, { status: 400 });
  }

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

  const body = await req.json();
  const parsed = automationFlowSchema.partial().parse(body);

  if (parsed.steps) {
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
  }

  const updated = await prisma.automationFlow.update({
    where: { id: flowId, userId: session.user.id },
    data: {
      title: parsed.title ?? undefined,
      description: parsed.description ?? undefined,
      steps: (parsed.steps as any) ?? undefined,
      category: parsed.category ?? undefined,
      aiParams: (parsed.aiParams as any) ?? undefined,
      status: parsed.status as any,
    },
  });
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (req: Request, { params }: Params) => {
  const flowId = resolveFlowId(req, params);
  if (!flowId || flowId === "undefined") {
    return NextResponse.json({ error: "Invalid automation id" }, { status: 400 });
  }

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

  const existing = await prisma.automationFlow.findFirst({
    where: { id: flowId, userId: session.user.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ success: true, message: "Already deleted" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.automationRun.deleteMany({ where: { flowId, userId: session.user.id } });
    await tx.trigger.deleteMany({ where: { flowId } });
    await tx.action.deleteMany({ where: { flowId } });
    await tx.automationFlow.delete({
      where: { id: existing.id },
    });
  });
  return NextResponse.json({ success: true });
});
