import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { executeAutomationRun } from "@/lib/automation/engine";
import { readFlowSnapshotFromRunOutput } from "@/lib/automation/versioning";
import { requireSystemFlag } from "@/lib/system-flags-guard";
import { getAutomationPermissions, hasAutomationPermission } from "@/lib/automation/permissions";

const SAFE_PROVIDER_STEPS = new Set(["sendEmail", "sendWhatsApp"]);

const readLastFailedStep = (logs: unknown) => {
  if (!Array.isArray(logs)) return null;
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const entry = logs[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const step = String((entry as Record<string, unknown>)["step"] || "");
    const result = String((entry as Record<string, unknown>)["result"] || "");
    const isFailure = result === "failed" || result === "retry-exhausted";
    if (!isFailure) continue;
    return {
      step,
      stepIndex:
        typeof (entry as Record<string, unknown>)["stepIndex"] === "number"
          ? ((entry as Record<string, unknown>)["stepIndex"] as number)
          : null,
      result,
      error: String((entry as Record<string, unknown>)["error"] || ""),
    };
  }
  return null;
};

export const POST = withErrorHandling(async (req: Request) => {
  const replayDisabled = await requireSystemFlag(
    "automation_replay_enabled",
    "Automation replay is currently disabled."
  );
  if (replayDisabled) return replayDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await getAutomationPermissions(session.user.id);
  if (!hasAutomationPermission(permissions, "run")) {
    return NextResponse.json(
      {
        error: "Forbidden",
        type: "permission_denied",
        action: "retry_automation_step",
        role: permissions.role,
      },
      { status: 403 }
    );
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

  const body = await req.json().catch(() => ({}));
  const runId = String((body as any)?.runId || "").trim();
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: { flow: true },
  });
  if (!run?.flow || run.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const runStatus = String(run.runStatus || "").toUpperCase();
  if (runStatus === "SUCCESS") {
    return NextResponse.json(
      {
        error: "Run already succeeded",
        type: "already_succeeded",
      },
      { status: 409 }
    );
  }

  const failedStep = readLastFailedStep(run.logs);
  if (!failedStep || !SAFE_PROVIDER_STEPS.has(failedStep.step)) {
    return NextResponse.json(
      {
        error: "Safe retry is only available for failed messaging steps",
        type: "not_retryable",
        runStatus,
      },
      { status: 409 }
    );
  }

  if (runStatus === "FAILED") {
    await prisma.automationRun.updateMany({
      where: { id: run.id, runStatus: "FAILED" },
      data: { runStatus: "PENDING", completedAt: null },
    });
  }

  const snapshot = readFlowSnapshotFromRunOutput(run.output);
  const flowForReplay = snapshot
    ? {
        ...run.flow,
        title: snapshot.title,
        description: snapshot.description,
        steps: snapshot.steps,
      }
    : run.flow;

  const replayInput = ((run.output as any)?.input || {}) as Record<string, unknown>;
  const result = await executeAutomationRun(flowForReplay, replayInput, {
    trigger: "Safe retry",
    source: "Automation Operations",
    resumeRunId: run.id,
  });

  if (!result) {
    return NextResponse.json({ error: "Safe retry failed" }, { status: 500 });
  }

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "AUTOMATION_SAFE_RETRY",
      metadata: {
        runId: run.id,
        flowId: run.flow.id,
        failedStep: failedStep.step,
        failedStepIndex: failedStep.stepIndex,
        failedResult: failedStep.result,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    runId: run.id,
    status: result.status,
    failedStep,
    logs: result.logs,
  });
});
