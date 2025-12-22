import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";
import { prisma } from "@/lib/prisma";
import { enforceUsageLimit, getUserPlan, isPlanAtLeast } from "@/lib/entitlements";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(session.user.id);
  if (!isPlanAtLeast(plan, "pro")) {
    return NextResponse.json(
      { error: "Upgrade required", type: "upgrade_required", requiredPlan: "pro", plan },
      { status: 402 }
    );
  }
  const usage = await enforceUsageLimit(session.user.id, "aiRequests");
  if (!usage.ok) {
    return NextResponse.json(
      { error: "Upgrade required", type: "limit_reached", reason: "AI usage limit reached", requiredPlan: "pro", ...usage },
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
