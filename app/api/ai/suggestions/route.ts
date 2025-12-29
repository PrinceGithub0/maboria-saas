import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";
import { prisma } from "@/lib/prisma";
import { enforceEntitlement, enforceUsageLimit } from "@/lib/entitlements";

export const GET = withErrorHandling(async () => {
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

  assertRateLimit(`ai:suggestions:${session.user.id}`);

  const data = await prisma.invoice.findMany({
    where: { userId: session.user.id },
    take: 10,
  });

  const prompt = `
User invoices: ${JSON.stringify(data)}
Suggest 3 automations for this business based on invoice and activity patterns.
Return JSON: [{title, description, category, trigger, actions}]
`;

  const json = await aiRouter({
    mode: "flow-generate",
    prompt,
    userId: session.user.id,
  });
  return NextResponse.json(JSON.parse(json));
});
