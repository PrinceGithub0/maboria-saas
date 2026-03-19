import { AdminNotificationSeverity, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Scope = "GLOBAL" | "TENANT";

const PLATFORM_WIDE_COMPONENTS = new Set([
  "DATABASE",
  "AUTH",
  "PAYMENT_PROVIDER",
  "AUTOMATION_ENGINE",
  "QUEUE",
  "WORKER",
  "EMAIL_SYSTEM",
  "SECURITY",
]);

const INFO_EVENT_TYPES = new Set([
  "TICKET_ASSIGNED",
  "TICKET_UPDATED",
  "INVOICE_GENERATED",
  "SUPPORT_TICKET_ASSIGNED",
  "ADMIN_ACTIVITY",
  "USER_UPDATED",
]);

const WARNING_EVENT_TYPES = new Set([
  "AUTOMATION_RUN_FAILED",
  "WEBHOOK_FAILED",
  "PAYMENT_FAILED",
  "SLA_BREACH",
]);

function normalizeScope(raw: unknown, tenantId: string | null): Scope {
  const normalized = String(raw || "").trim().toUpperCase();
  if (normalized === "GLOBAL") return "GLOBAL";
  if (normalized === "TENANT") return "TENANT";
  return tenantId ? "TENANT" : "GLOBAL";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function classifyHistoricalSeverity(input: {
  eventType: string;
  tenantId: string | null;
  metadata: Record<string, unknown>;
  currentSeverity: AdminNotificationSeverity;
}) {
  const eventType = String(input.eventType || "").trim().toUpperCase();
  const metadata = input.metadata;
  const scope = normalizeScope(metadata.scope, input.tenantId);
  const systemComponent = String(metadata.systemComponent || metadata.component || "")
    .trim()
    .toUpperCase();
  const affectedTenantsCount = Number(metadata.affectedTenantsCount || 0);
  const isPlatformWide =
    scope === "GLOBAL" ||
    (Number.isFinite(affectedTenantsCount) && affectedTenantsCount > 5) ||
    PLATFORM_WIDE_COMPONENTS.has(systemComponent);

  if (INFO_EVENT_TYPES.has(eventType)) return "INFO" as const;
  if (WARNING_EVENT_TYPES.has(eventType)) return "WARNING" as const;

  if (scope === "TENANT") return "WARNING" as const;
  if (!isPlatformWide && input.currentSeverity === "CRITICAL") return "WARNING" as const;

  return input.currentSeverity;
}

async function main() {
  const criticalRows = await prisma.adminNotification.findMany({
    where: { severity: "CRITICAL" },
    select: {
      id: true,
      severity: true,
      tenantId: true,
      sourceEventType: true,
      metadata: true,
    },
  });

  let scanned = 0;
  let changed = 0;
  let downgradedToWarning = 0;
  let downgradedToInfo = 0;

  for (const row of criticalRows) {
    scanned += 1;
    const metadata = asRecord(row.metadata);
    const nextSeverity = classifyHistoricalSeverity({
      eventType: row.sourceEventType,
      tenantId: row.tenantId,
      metadata,
      currentSeverity: row.severity,
    });

    if (nextSeverity === row.severity) continue;

    await prisma.adminNotification.update({
      where: { id: row.id },
      data: { severity: nextSeverity },
    });
    changed += 1;
    if (nextSeverity === "WARNING") downgradedToWarning += 1;
    if (nextSeverity === "INFO") downgradedToInfo += 1;
  }

  console.log("downgrade-false-critical completed");
  console.log(
    JSON.stringify(
      {
        scanned,
        changed,
        downgradedToWarning,
        downgradedToInfo,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Failed to downgrade false critical notifications", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

