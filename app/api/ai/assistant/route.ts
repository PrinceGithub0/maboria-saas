import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { fetchRecentMemory, rememberAssistantMessage } from "@/lib/assistant-memory";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
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
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: "pro",
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const usage = await enforceUsageLimit(session.user.id, "aiRequests", false);
  if (!usage.ok) {
    if (usage.code === "payment_required") {
      return NextResponse.json(
        {
          error: "Payment required",
          type: "payment_required",
          reason: "Active subscription required to use AI",
          plan: usage.plan,
        },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: "limit_reached",
        reason: "AI usage limit reached for this month",
        requiredPlan: "pro",
        plan: usage.plan,
        limit: usage.limit,
        used: usage.used,
      },
      { status: 402 }
    );
  }

  const { mode, prompt, context } = await req.json();
  assertRateLimit(`ai:${session.user.id}`);
  await rememberAssistantMessage(session.user.id, "user", prompt);
  const memory = await fetchRecentMemory(session.user.id);
  const memoryText = memory.map((m) => `${m.role}: ${m.content}`).join("\n");

  const output = await aiRouter({
    mode: mode === "automation" ? "flow-generate" : mode,
    prompt: `${prompt}\nRecent memory:\n${memoryText}`,
    context,
    userId: session.user.id,
  });

  await rememberAssistantMessage(session.user.id, "assistant", output);
  return NextResponse.json({ answer: output });
});
