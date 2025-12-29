import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";
import { prisma } from "@/lib/prisma";
import { enforceEntitlement, enforceUsageLimit } from "@/lib/entitlements";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "ai",
    requiredPlan: "pro",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      { error: "Upgrade required", type: entitlement.type, requiredPlan: "pro", reason: entitlement.reason },
      { status: 403 }
    );
  }
  const usage = await enforceUsageLimit(session.user.id, "aiRequests", false);
  if (!usage.ok) {
    if (usage.code === "payment_required") {
      return NextResponse.json(
        { error: "Payment required", type: "payment_required", reason: "Active subscription required for AI" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Upgrade required", type: "limit_reached", reason: "AI usage limit reached", requiredPlan: "pro", ...usage },
      { status: 403 }
    );
  }

  const { flowId, goal } = await req.json();
  assertRateLimit(`ai:flow-improve:${session.user.id}`);

  const flow = await prisma.automationFlow.findUnique({
    where: { id: flowId, userId: session.user.id },
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
  const updated = await prisma.automationFlow.update({
    where: { id: flowId },
    data: {
      title: improved.title || flow.title,
      description: improved.description || flow.description,
      steps: improved.actions || flow.steps,
      triggers: {
        deleteMany: {},
        create: improved.trigger ? [{ type: improved.trigger.type, config: improved.trigger.config }] : [],
      },
      actions: {
        deleteMany: {},
        create: (improved.actions || []).map((a: any, idx: number) => ({
          type: a.type,
          config: a.config,
          order: idx + 1,
        })),
      },
    },
    include: { triggers: true, actions: true },
  });

  return NextResponse.json(updated);
});
