import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { executeAutomationRun } from "@/lib/automation/engine";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { readFlowSnapshotFromRunOutput } from "@/lib/automation/versioning";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
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
  const { runId } = await req.json();
  const run = await prisma.automationRun.findUnique({ where: { id: runId }, include: { flow: true } });
  if (!run?.flow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const snapshot = readFlowSnapshotFromRunOutput(run.output);
  const flowForReplay = snapshot
    ? {
        ...run.flow,
        title: snapshot.title,
        description: snapshot.description,
        steps: snapshot.steps,
      }
    : run.flow;
  const resumeCandidateStatuses = new Set(["FAILED", "PENDING", "RUNNING"]);
  const shouldResumeExistingRun = resumeCandidateStatuses.has(String(run.runStatus || "").toUpperCase());
  const replayInput = ((run.output as any)?.input || {}) as Record<string, unknown>;

  const result = await executeAutomationRun(flowForReplay, replayInput, {
    trigger: "Replay",
    source: "Admin",
    resumeRunId: shouldResumeExistingRun ? run.id : undefined,
  });
  if (!result) {
    return NextResponse.json({ error: "Replay failed" }, { status: 500 });
  }
  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "ADMIN_AUTOMATION_REPLAY",
      metadata: {
        runId,
        flowId: run.flow.id,
        flowVersion: snapshot?.version || null,
        resumed: shouldResumeExistingRun,
      },
    },
  });
  return NextResponse.json({ status: result.status, logs: result.logs });
});
