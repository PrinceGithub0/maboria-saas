import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { executeAutomationRun } from "@/lib/automation/engine";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { flowId, input } = await req.json();
  assertRateLimit(`run:${session.user.id}`);
  const flow = await prisma.automationFlow.findUnique({ where: { id: flowId } });
  if (!flow || flow.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await executeAutomationRun(flow, input || {});
  if ((result as any).status === "FAILED") {
    const diagnosis = await aiRouter({
      mode: "diagnose",
      prompt: "Diagnose automation failure",
      context: { flow, logs: result.logs },
      userId: session.user.id,
    });
    return NextResponse.json({ status: result.status, logs: result.logs, diagnosis });
  }
  return NextResponse.json({ status: result.status, logs: result.logs });
});
