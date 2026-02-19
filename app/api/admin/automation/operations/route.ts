import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

const parseNextRunAt = (output: unknown) => {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const resumeState = (output as Record<string, unknown>)["resumeState"];
  if (!resumeState || typeof resumeState !== "object" || Array.isArray(resumeState)) return null;
  const raw = String((resumeState as Record<string, unknown>)["nextRunAt"] || "");
  if (!raw.trim()) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const hasProviderFailure = (logs: unknown, providerStep: "sendEmail" | "sendWhatsApp") => {
  if (!Array.isArray(logs)) return false;
  return logs.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const step = String((entry as Record<string, unknown>)["step"] || "");
    const result = String((entry as Record<string, unknown>)["result"] || "");
    return step === providerStep && (result === "failed" || result === "retry-exhausted");
  });
};

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const stuckCutoff = new Date(now.getTime() - 10 * 60_000);
  const failedSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [runningStale, pendingRuns, failedRecent, pendingCount, runningCount] = await prisma.$transaction([
    prisma.automationRun.findMany({
      where: {
        runStatus: "RUNNING",
        startedAt: { lte: stuckCutoff },
      },
      orderBy: { startedAt: "asc" },
      take: 100,
      include: { flow: { select: { id: true, title: true, status: true } } },
    }),
    prisma.automationRun.findMany({
      where: { runStatus: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 400,
      include: { flow: { select: { id: true, title: true, status: true } } },
    }),
    prisma.automationRun.findMany({
      where: {
        runStatus: "FAILED",
        createdAt: { gte: failedSince },
      },
      orderBy: { createdAt: "desc" },
      take: 400,
      include: { flow: { select: { id: true, title: true, status: true } } },
    }),
    prisma.automationRun.count({ where: { runStatus: "PENDING" } }),
    prisma.automationRun.count({ where: { runStatus: "RUNNING" } }),
  ]);

  const duePending = pendingRuns
    .map((run) => ({ run, nextRunAt: parseNextRunAt(run.output) }))
    .filter((item) => item.nextRunAt && item.nextRunAt.getTime() <= now.getTime())
    .slice(0, 100)
    .map(({ run, nextRunAt }) => ({
      id: run.id,
      flowId: run.flowId,
      flowTitle: run.flow?.title ?? "Unknown",
      flowStatus: run.flow?.status ?? null,
      userId: run.userId,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      nextRunAt: nextRunAt?.toISOString() ?? null,
    }));

  const providerFailures = failedRecent.reduce(
    (acc, run) => {
      if (hasProviderFailure(run.logs, "sendEmail")) acc.email += 1;
      if (hasProviderFailure(run.logs, "sendWhatsApp")) acc.whatsapp += 1;
      return acc;
    },
    { email: 0, whatsapp: 0 }
  );

  const stuckRuns = runningStale.map((run) => ({
    id: run.id,
    flowId: run.flowId,
    flowTitle: run.flow?.title ?? "Unknown",
    flowStatus: run.flow?.status ?? null,
    userId: run.userId,
    startedAt: run.startedAt,
    createdAt: run.createdAt,
  }));

  return NextResponse.json({
    generatedAt: now.toISOString(),
    counts: {
      pending: pendingCount,
      running: runningCount,
      failed24h: failedRecent.length,
      staleRunning: stuckRuns.length,
      duePending: duePending.length,
    },
    providerFailures24h: providerFailures,
    staleRunning: stuckRuns,
    duePending,
  });
});
