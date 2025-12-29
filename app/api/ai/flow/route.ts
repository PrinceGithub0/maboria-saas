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

  const { prompt } = await req.json();
  assertRateLimit(`ai:flow:${session.user.id}`);

  const json = await aiRouter({
    mode: "flow-generate",
    prompt,
    userId: session.user.id,
  });

  const flow = JSON.parse(json);
  const created = await prisma.automationFlow.create({
    data: {
      userId: session.user.id,
      title: flow.title,
      description: flow.description || flow.title,
      steps: flow.actions || [],
      status: "ACTIVE",
      triggers: flow.trigger ? { create: [{ type: flow.trigger.type, config: flow.trigger.config }] } : undefined,
      actions: {
        create: (flow.actions || []).map((a: any, idx: number) => ({
          type: a.type,
          config: a.config,
          order: idx + 1,
        })),
      },
    },
  });

  return NextResponse.json(created);
});
