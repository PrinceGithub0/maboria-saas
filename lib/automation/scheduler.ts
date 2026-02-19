import { prisma } from "../prisma";
import { executeAutomationRun } from "./engine";
import { readFlowSnapshotFromRunOutput } from "./versioning";
import { appendAutomationAuditEvent } from "./audit";

const parseNextRunAt = (output: unknown) => {
  if (!output || typeof output !== "object") return null;
  const resumeState = (output as Record<string, unknown>)["resumeState"];
  if (!resumeState || typeof resumeState !== "object") return null;
  const nextRunAt = String((resumeState as Record<string, unknown>)["nextRunAt"] || "").trim();
  if (!nextRunAt) return null;
  const parsed = new Date(nextRunAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export async function processDueAutomationRuns({ limit = 25 }: { limit?: number } = {}) {
  const now = new Date();
  const pendingRuns = await prisma.automationRun.findMany({
    where: { runStatus: "PENDING" },
    include: { flow: true },
    orderBy: { createdAt: "asc" },
    take: Math.max(limit * 4, limit),
  });

  const dueRuns = pendingRuns
    .filter((run) => {
      const nextRunAt = parseNextRunAt(run.output);
      if (!nextRunAt) return false;
      return nextRunAt.getTime() <= now.getTime();
    })
    .slice(0, limit);

  let resumed = 0;
  let skipped = 0;
  let failed = 0;

  for (const run of dueRuns) {
    if (String(run.flow?.status || "").toUpperCase() !== "ACTIVE") {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          runStatus: "FAILED",
          completedAt: new Date(),
          output: {
            ...((run.output as Record<string, unknown>) || {}),
            scheduler: {
              skippedAt: new Date().toISOString(),
              reason: "flow_not_active",
            },
          },
        },
      });
      await appendAutomationAuditEvent({
        userId: run.userId,
        flowId: run.flowId,
        runId: run.id,
        event: "SCHEDULER_SKIPPED",
        details: { reason: "flow_not_active" },
      }).catch(() => null);
      skipped += 1;
      continue;
    }

    const snapshot = readFlowSnapshotFromRunOutput(run.output);
    const flowForResume = snapshot
      ? {
          ...run.flow,
          title: snapshot.title,
          description: snapshot.description,
          steps: snapshot.steps,
        }
      : run.flow;

    try {
      const result = await executeAutomationRun(
        flowForResume,
        ((run.output as any)?.input || {}) as Record<string, unknown>,
        {
          trigger: "Scheduler",
          source: "AutomationScheduler",
          resumeRunId: run.id,
          idempotencyKey: undefined,
        }
      );
      if ((result as any)?.skipped) {
        await appendAutomationAuditEvent({
          userId: run.userId,
          flowId: run.flowId,
          runId: run.id,
          event: "SCHEDULER_SKIPPED",
          details: { reason: (result as any)?.reason || "resume_not_pending" },
        }).catch(() => null);
        skipped += 1;
        continue;
      }
      await appendAutomationAuditEvent({
        userId: run.userId,
        flowId: run.flowId,
        runId: run.id,
        event: "SCHEDULER_RESUMED",
        details: { source: "AutomationScheduler" },
      }).catch(() => null);
      resumed += 1;
    } catch (error: any) {
      await appendAutomationAuditEvent({
        userId: run.userId,
        flowId: run.flowId,
        runId: run.id,
        event: "SCHEDULER_RESUME_FAILED",
        details: { error: error?.message || "resume_failed" },
      }).catch(() => null);
      failed += 1;
    }
  }

  return {
    scanned: pendingRuns.length,
    due: dueRuns.length,
    resumed,
    skipped,
    failed,
  };
}
