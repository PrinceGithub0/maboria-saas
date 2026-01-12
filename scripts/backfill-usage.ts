import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filename: string) {
  const envPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run usage backfill.");
}

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

const categories = [
  { label: "Automation runs", type: "automationRuns" as const },
  { label: "Invoices", type: "invoices" as const },
  { label: "AI requests", type: "aiRequests" as const },
];

function monthStartUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
}

function addMonthsUtc(date: Date, delta: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1, 0, 0, 0));
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function getCount(userId: string, type: (typeof categories)[number]["type"], start: Date, end: Date) {
  switch (type) {
    case "automationRuns":
      return prisma.automationRun.count({ where: { userId, createdAt: { gte: start, lt: end } } });
    case "invoices":
      return prisma.invoice.count({ where: { userId, generatedAt: { gte: start, lt: end } } });
    case "aiRequests":
      return prisma.aiUsageLog.count({ where: { userId, createdAt: { gte: start, lt: end } } });
    default:
      return 0;
  }
}

async function run() {
  const monthsRaw = process.env.USAGE_BACKFILL_MONTHS ?? process.argv[2] ?? "6";
  const months = Number.isFinite(Number(monthsRaw)) ? Math.max(1, Number(monthsRaw)) : 6;
  const now = new Date();
  const currentMonthStart = monthStartUtc(now);
  const earliestStart = addMonthsUtc(currentMonthStart, -(months - 1));
  const endExclusive = addMonthsUtc(currentMonthStart, 1);

  const users = await prisma.user.findMany({ select: { id: true } });
  console.log(`Backfilling ${months} month(s) of usage for ${users.length} user(s).`);

  for (const user of users) {
    const existing = await prisma.usageRecord.findMany({
      where: {
        userId: user.id,
        period: "monthly",
        createdAt: { gte: earliestStart, lt: endExclusive },
        category: { in: categories.map((c) => c.label) },
      },
      select: { category: true, createdAt: true },
    });

    const existingKeys = new Set(
      existing.map((row) => `${row.category}:${monthKey(row.createdAt)}`)
    );

    for (let i = 0; i < months; i += 1) {
      const periodStart = addMonthsUtc(earliestStart, i);
      const periodEnd = addMonthsUtc(periodStart, 1);
      const keySuffix = monthKey(periodStart);

      for (const category of categories) {
        const key = `${category.label}:${keySuffix}`;
        if (existingKeys.has(key)) continue;

        const amount = await getCount(user.id, category.type, periodStart, periodEnd);
        if (amount <= 0) continue;

        await prisma.usageRecord.create({
          data: {
            userId: user.id,
            category: category.label,
            amount,
            period: "monthly",
            createdAt: periodStart,
          },
        });
        console.log(`Created ${category.label} (${amount}) for ${user.id} @ ${keySuffix}`);
      }
    }
  }

  console.log("Usage backfill complete.");
  await prisma.$disconnect();
}

run().catch((error) => {
  console.error(error);
  prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
