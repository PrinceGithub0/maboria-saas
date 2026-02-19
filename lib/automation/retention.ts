import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

export const AUTOMATION_RETENTION_POLICY = {
  detailedRunLogsDays: 90,
  archivedRunSummaryDays: 365,
  financialRecordsDeleted: false,
} as const;

const asJsonObject = (value: Record<string, unknown>): Prisma.InputJsonValue =>
  value as Prisma.InputJsonValue;

const asJsonArray = (value: unknown[]): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const toDateBeforeDays = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const readRetentionMeta = (output: unknown) => {
  if (!output || typeof output !== "object" || Array.isArray(output)) return {};
  const retention = (output as Record<string, unknown>)["retention"];
  if (!retention || typeof retention !== "object" || Array.isArray(retention)) return {};
  return retention as Record<string, unknown>;
};

export async function getAutomationRetentionOverview() {
  const detailCutoff = toDateBeforeDays(AUTOMATION_RETENTION_POLICY.detailedRunLogsDays);
  const archiveCutoff = toDateBeforeDays(AUTOMATION_RETENTION_POLICY.archivedRunSummaryDays);
  const [candidateLogPrune, archivedRuns] = await prisma.$transaction([
    prisma.automationRun.count({
      where: {
        completedAt: { lte: detailCutoff },
        runStatus: { in: ["SUCCESS", "FAILED"] },
      },
    }),
    prisma.automationRun.count({
      where: {
        completedAt: { lte: archiveCutoff },
      },
    }),
  ]);
  return {
    policy: AUTOMATION_RETENTION_POLICY,
    candidateLogPrune,
    archivedRuns,
  };
}

export async function archiveOldAutomationRunLogs({
  limit = 250,
  dryRun = false,
}: {
  limit?: number;
  dryRun?: boolean;
} = {}) {
  const detailCutoff = toDateBeforeDays(AUTOMATION_RETENTION_POLICY.detailedRunLogsDays);
  const runs = await prisma.automationRun.findMany({
    where: {
      completedAt: { lte: detailCutoff },
      runStatus: { in: ["SUCCESS", "FAILED"] },
    },
    select: {
      id: true,
      runStatus: true,
      completedAt: true,
      logs: true,
      output: true,
    },
    orderBy: { completedAt: "asc" },
    take: Math.max(1, Math.min(limit, 1000)),
  });

  let scanned = 0;
  let skipped = 0;
  let archived = 0;

  for (const run of runs) {
    scanned += 1;
    const logs = Array.isArray(run.logs) ? run.logs : [];
    const retention = readRetentionMeta(run.output);
    const alreadyArchived = Boolean(retention["archivedAt"]);
    if (alreadyArchived && logs.length <= 1) {
      skipped += 1;
      continue;
    }

    const compactLog = [
      {
        timestamp: new Date().toISOString(),
        result: "archived",
        summary: `Run archived after ${AUTOMATION_RETENTION_POLICY.detailedRunLogsDays} days`,
        originalLogCount: logs.length,
        runStatus: run.runStatus,
      },
    ];

    const outputBase =
      run.output && typeof run.output === "object" && !Array.isArray(run.output)
        ? (run.output as Record<string, unknown>)
        : {};
    const output = {
      ...outputBase,
      retention: {
        ...retention,
        archivedAt: new Date().toISOString(),
        originalLogCount: logs.length,
        policy: AUTOMATION_RETENTION_POLICY,
      },
    };

    if (!dryRun) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          logs: asJsonArray(compactLog),
          output: asJsonObject(output),
        },
      });
    }

    archived += 1;
  }

  return {
    scanned,
    archived,
    skipped,
    dryRun,
    policy: AUTOMATION_RETENTION_POLICY,
  };
}
