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
  throw new Error("DATABASE_URL is required to run analytics backfill.");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

const toUtcDay = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0));

async function resolveWorkspaceId(userId: string) {
  const owned = await prisma.business.findFirst({
    where: { ownerId: userId },
    select: { id: true, ownerId: true },
  });
  if (owned) return { workspaceId: owned.id, ownerId: owned.ownerId };
  const member = await prisma.businessMember.findFirst({
    where: { userId },
    select: { businessId: true, business: { select: { ownerId: true } } },
  });
  if (member?.businessId) {
    return { workspaceId: member.businessId, ownerId: member.business?.ownerId ?? userId };
  }
  return { workspaceId: userId, ownerId: userId };
}

async function upsertLegacyEvent(params: {
  userId: string;
  workspaceId: string;
  type:
    | "INVOICE_SENT"
    | "AUTOMATION_RUN"
    | "AI_REQUEST"
    | "AI_TOKENS"
    | "WHATSAPP_MESSAGE"
    | "WHATSAPP_MESSAGE_SENT";
  count: number;
  tokenCount?: number;
  date: Date;
  source: string;
}) {
  const day = toUtcDay(params.date);
  const resolvedType = params.type === "WHATSAPP_MESSAGE" ? "WHATSAPP_MESSAGE_SENT" : params.type;
  const existing = await prisma.analyticsEvent.findFirst({
    where: {
      workspaceId: params.workspaceId,
      type: resolvedType,
      day,
      source: params.source,
    },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.analyticsEvent.create({
    data: {
      userId: params.userId,
      workspaceId: params.workspaceId,
      orgId: params.workspaceId,
      type: resolvedType,
      count: params.count,
      tokenCount: params.tokenCount ?? null,
      source: params.source,
      day,
      createdAt: params.date,
    },
  });
  return true;
}

async function backfillUsageRecords() {
  const usage = await prisma.usageRecord.findMany({
    where: {
      category: { in: ["Invoices", "Automation runs"] },
    },
  });
  const grouped = new Map<
    string,
    { userId: string; type: "INVOICE_SENT" | "AUTOMATION_RUN"; count: number; date: Date }
  >();
  for (const row of usage) {
    const type = row.category === "Invoices" ? "INVOICE_SENT" : "AUTOMATION_RUN";
    const date = toUtcDay(row.createdAt);
    const key = `${row.userId}:${type}:${date.toISOString().slice(0, 10)}`;
    const entry = grouped.get(key);
    if (entry) {
      entry.count += row.amount;
    } else {
      grouped.set(key, { userId: row.userId, type, count: row.amount, date });
    }
  }

  let inserted = 0;
  for (const entry of grouped.values()) {
    const scope = await resolveWorkspaceId(entry.userId);
    const didInsert = await upsertLegacyEvent({
      userId: scope.ownerId,
      workspaceId: scope.workspaceId,
      type: entry.type,
      count: entry.count,
      date: entry.date,
      source: "legacy_usage",
    });
    if (didInsert) inserted += 1;
  }
  console.log(`Backfilled ${inserted} legacy usage records into analytics events.`);
  return inserted;
}

async function backfillAiLogs() {
  const logs = await prisma.aiUsageLog.findMany({});
  const grouped = new Map<string, { userId: string; count: number; tokens: number; date: Date }>();
  for (const log of logs) {
    const date = toUtcDay(log.createdAt);
    const key = `${log.userId}:${date.toISOString().slice(0, 10)}`;
    const entry = grouped.get(key);
    if (entry) {
      entry.count += 1;
      entry.tokens += Number(log.tokens || 0);
    } else {
      grouped.set(key, { userId: log.userId, count: 1, tokens: Number(log.tokens || 0), date });
    }
  }
  let inserted = 0;
  for (const entry of grouped.values()) {
    const scope = await resolveWorkspaceId(entry.userId);
    const didInsertRequest = await upsertLegacyEvent({
      userId: scope.ownerId,
      workspaceId: scope.workspaceId,
      type: "AI_REQUEST",
      count: entry.count,
      date: entry.date,
      source: "legacy_ai",
    });
    const didInsertTokens = await upsertLegacyEvent({
      userId: scope.ownerId,
      workspaceId: scope.workspaceId,
      type: "AI_TOKENS",
      count: entry.tokens,
      tokenCount: entry.tokens,
      date: entry.date,
      source: "legacy_ai",
    });
    if (didInsertRequest) inserted += 1;
    if (didInsertTokens) inserted += 1;
  }
  console.log(`Backfilled ${inserted} legacy AI analytics events.`);
}

async function backfillWhatsappMessages() {
  const messages = await prisma.message.findMany({
    where: {
      direction: "OUTBOUND",
      status: { in: ["SENT", "DELIVERED"] },
    },
    include: {
      conversation: {
        select: {
          businessId: true,
          business: { select: { ownerId: true } },
        },
      },
    },
  });
  const grouped = new Map<string, { userId: string; workspaceId: string; count: number; date: Date }>();
  for (const msg of messages) {
    const workspaceId = msg.conversation?.businessId ?? msg.conversation?.business?.ownerId ?? "";
    const ownerId = msg.conversation?.business?.ownerId ?? "";
    if (!workspaceId || !ownerId) continue;
    const date = toUtcDay(msg.createdAt);
    const key = `${workspaceId}:${date.toISOString().slice(0, 10)}`;
    const entry = grouped.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      grouped.set(key, { userId: ownerId, workspaceId, count: 1, date });
    }
  }
  let inserted = 0;
  for (const entry of grouped.values()) {
    const didInsert = await upsertLegacyEvent({
      userId: entry.userId,
      workspaceId: entry.workspaceId,
      type: "WHATSAPP_MESSAGE_SENT",
      count: entry.count,
      date: entry.date,
      source: "legacy_whatsapp",
    });
    if (didInsert) inserted += 1;
  }
  console.log(`Backfilled ${inserted} legacy WhatsApp analytics events.`);
}

async function backfillInvoiceTableIfNeeded() {
  const legacyUsageCount = await prisma.analyticsEvent.count({
    where: { source: "legacy_usage", type: "INVOICE_SENT" },
  });
  if (legacyUsageCount > 0) {
    console.log("Invoice table backfill skipped: legacy usage already present.");
    return;
  }
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["SENT", "PAID"] } },
    select: { userId: true, generatedAt: true },
  });
  const grouped = new Map<string, { userId: string; count: number; date: Date }>();
  for (const invoice of invoices) {
    const date = toUtcDay(invoice.generatedAt);
    const key = `${invoice.userId}:${date.toISOString().slice(0, 10)}`;
    const entry = grouped.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      grouped.set(key, { userId: invoice.userId, count: 1, date });
    }
  }
  let inserted = 0;
  for (const entry of grouped.values()) {
    const scope = await resolveWorkspaceId(entry.userId);
    const didInsert = await upsertLegacyEvent({
      userId: scope.ownerId,
      workspaceId: scope.workspaceId,
      type: "INVOICE_SENT",
      count: entry.count,
      date: entry.date,
      source: "legacy_invoice",
    });
    if (didInsert) inserted += 1;
  }
  console.log(`Backfilled ${inserted} legacy invoice table events.`);
}

async function backfillAutomationRunsIfNeeded() {
  const legacyUsageCount = await prisma.analyticsEvent.count({
    where: { source: "legacy_usage", type: "AUTOMATION_RUN" },
  });
  if (legacyUsageCount > 0) {
    console.log("Automation table backfill skipped: legacy usage already present.");
    return;
  }
  const runs = await prisma.automationRun.findMany({
    where: { runStatus: "SUCCESS" },
    select: { userId: true, createdAt: true },
  });
  const grouped = new Map<string, { userId: string; count: number; date: Date }>();
  for (const run of runs) {
    const date = toUtcDay(run.createdAt);
    const key = `${run.userId}:${date.toISOString().slice(0, 10)}`;
    const entry = grouped.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      grouped.set(key, { userId: run.userId, count: 1, date });
    }
  }
  let inserted = 0;
  for (const entry of grouped.values()) {
    const scope = await resolveWorkspaceId(entry.userId);
    const didInsert = await upsertLegacyEvent({
      userId: scope.ownerId,
      workspaceId: scope.workspaceId,
      type: "AUTOMATION_RUN",
      count: entry.count,
      date: entry.date,
      source: "legacy_automation",
    });
    if (didInsert) inserted += 1;
  }
  console.log(`Backfilled ${inserted} legacy automation runs.`);
}

async function run() {
  await backfillUsageRecords();
  await backfillInvoiceTableIfNeeded();
  await backfillAutomationRunsIfNeeded();
  await backfillAiLogs();
  await backfillWhatsappMessages();
  await prisma.$disconnect();
}

run().catch((error) => {
  console.error(error);
  prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
