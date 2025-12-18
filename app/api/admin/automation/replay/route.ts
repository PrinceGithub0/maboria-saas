import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { executeAutomationRun } from "@/lib/automation/engine";
import { withErrorHandling } from "@/lib/api-handler";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { runId } = await req.json();
  const run = await prisma.automationRun.findUnique({ where: { id: runId }, include: { flow: true } });
  if (!run?.flow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await executeAutomationRun(run.flow, {});
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ADMIN_AUTOMATION_REPLAY", metadata: { runId } },
  });
  return NextResponse.json({ status: result.status, logs: result.logs });
});
