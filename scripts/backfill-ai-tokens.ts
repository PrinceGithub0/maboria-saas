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
  throw new Error("DATABASE_URL is required to backfill AI token usage.");
}

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
});

const CHARS_PER_TOKEN = 4;
const BATCH_SIZE = 200;

function estimateTokens(prompt?: string | null) {
  const length = prompt?.length ?? 0;
  return Math.max(1, Math.ceil(length / CHARS_PER_TOKEN));
}

async function run() {
  let updated = 0;
  let skipped = 0;
  let cursor: string | undefined;

  while (true) {
    const rows = await prisma.aiUsageLog.findMany({
      where: { tokens: { lte: 0 } },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, prompt: true, tokens: true },
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      const newTokens = estimateTokens(row.prompt);
      if (newTokens <= 0 || Number.isNaN(newTokens)) {
        skipped += 1;
        cursor = row.id;
        continue;
      }
      await prisma.aiUsageLog.update({
        where: { id: row.id },
        data: { tokens: newTokens },
      });
      updated += 1;
      cursor = row.id;
    }
  }

  console.log(`AI token backfill complete. Updated ${updated}, skipped ${skipped}.`);
  await prisma.$disconnect();
}

run().catch((error) => {
  console.error(error);
  prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
