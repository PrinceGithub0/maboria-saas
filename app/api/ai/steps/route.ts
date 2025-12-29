import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";
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
      {
        error: entitlement.reason,
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        plan: entitlement.plan,
      },
      { status: 402 }
    );
  }
  const usage = await enforceUsageLimit(session.user.id, "aiRequests", false);
  if (!usage.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: "limit_reached",
        reason: "AI usage limit reached",
        requiredPlan: "pro",
        ...usage,
      },
      { status: 402 }
    );
  }

  const { description } = await req.json();
  assertRateLimit(`ai:steps:${session.user.id}`);
  const json = await aiRouter({
    mode: "step-generate",
    prompt: description,
    userId: session.user.id,
  });
  return NextResponse.json(JSON.parse(json));
});
