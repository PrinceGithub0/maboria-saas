import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type LogEntry = {
  timestamp?: string | null;
};

const parseTimestamp = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const resolveLogBounds = (logs: LogEntry[]) => {
  const dates = logs
    .map((entry) => parseTimestamp(entry?.timestamp))
    .filter(Boolean) as Date[];
  if (!dates.length) return null;
  const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
  return { start: sorted[0], end: sorted[sorted.length - 1] };
};

async function main() {
  const runs = await prisma.automationRun.findMany({
    orderBy: { createdAt: "asc" },
  });

  let updated = 0;
  for (const run of runs) {
    const output = (run.output as any) || {};
    const logs = Array.isArray(run.logs) ? (run.logs as LogEntry[]) : [];
    const bounds = resolveLogBounds(logs);

    const nextOutput = {
      trigger: output.trigger ?? "Manual",
      source: output.source ?? "Backfill",
      input: output.input ?? null,
    };

    const startedAt = run.startedAt ?? bounds?.start ?? run.createdAt;
    const completedAt = run.completedAt ?? bounds?.end ?? run.createdAt;

    const shouldUpdate =
      !run.output ||
      output.trigger == null ||
      output.source == null ||
      run.startedAt == null ||
      run.completedAt == null;

    if (!shouldUpdate) continue;

    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        output: nextOutput,
        startedAt,
        completedAt,
      },
    });
    updated += 1;
  }

  console.log(`Backfill complete. Updated ${updated} run(s).`);
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
