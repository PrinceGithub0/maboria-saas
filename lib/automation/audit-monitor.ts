import { prisma } from "../prisma";
import { verifyAutomationAuditChain } from "./audit";

type AuditIntegrityFlowResult = {
  flowId: string | null;
  count: number;
  valid: boolean;
  invalidCount: number;
  invalid: Array<{ index: number; reason: string; createdAt: string }>;
};

type AuditIntegritySnapshot = {
  generatedAt: string;
  scanned: number;
  groups: number;
  invalidFlows: number;
  invalidEntries: number;
  perFlow: AuditIntegrityFlowResult[];
};

const ALERT_DEDUPE_WINDOW_HOURS = 24;

const readFlowId = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const flowId = String((metadata as Record<string, unknown>)["flowId"] || "").trim();
  return flowId || null;
};

export async function getAutomationAuditIntegritySnapshot({
  limit = 5000,
}: {
  limit?: number;
} = {}): Promise<AuditIntegritySnapshot> {
  const logs = await prisma.auditLog.findMany({
    where: { action: { startsWith: "AUTOMATION_AUDIT_" } },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 20_000)),
    select: { id: true, metadata: true, createdAt: true },
  });

  const grouped = new Map<string, Array<{ createdAt: Date; metadata: unknown }>>();
  for (const entry of logs) {
    const key = readFlowId(entry.metadata) || "__unknown__";
    const list = grouped.get(key) || [];
    list.push({ createdAt: entry.createdAt, metadata: entry.metadata });
    grouped.set(key, list);
  }

  const perFlow = Array.from(grouped.entries()).map(([key, entries]) => {
    const verification = verifyAutomationAuditChain(entries);
    return {
      flowId: key === "__unknown__" ? null : key,
      count: entries.length,
      valid: verification.valid,
      invalidCount: verification.invalidCount,
      invalid: verification.invalid,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    scanned: logs.length,
    groups: perFlow.length,
    invalidFlows: perFlow.filter((flow) => !flow.valid).length,
    invalidEntries: perFlow.reduce((sum, flow) => sum + flow.invalidCount, 0),
    perFlow,
  };
}

export async function emitAutomationAuditIntegrityAlerts(snapshot: AuditIntegritySnapshot) {
  const problematicFlows = snapshot.perFlow.filter((flow) => !flow.valid);
  if (!problematicFlows.length) {
    return { emitted: 0, skipped: 0, invalidFlows: 0 };
  }

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (!admins.length) {
    return { emitted: 0, skipped: problematicFlows.length, invalidFlows: problematicFlows.length };
  }

  const dedupeSince = new Date(Date.now() - ALERT_DEDUPE_WINDOW_HOURS * 60 * 60 * 1000);
  let emitted = 0;
  let skipped = 0;

  for (const flow of problematicFlows) {
    const fingerprint = `${flow.flowId || "unknown"}:${snapshot.generatedAt.slice(0, 10)}`;
    const existing = await prisma.activityLog.count({
      where: {
        action: "AUTOMATION_AUDIT_INTEGRITY_ALERT",
        timestamp: { gte: dedupeSince },
        metadata: { path: ["fingerprint"], equals: fingerprint },
      },
    });
    if (existing > 0) {
      skipped += 1;
      continue;
    }

    await prisma.$transaction([
      prisma.activityLog.create({
        data: {
          userId: admins[0].id,
          action: "AUTOMATION_AUDIT_INTEGRITY_ALERT",
          metadata: {
            fingerprint,
            flowId: flow.flowId,
            invalidCount: flow.invalidCount,
            totalEntries: flow.count,
            generatedAt: snapshot.generatedAt,
          },
        },
      }),
      prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: "automation",
          message: `Automation audit integrity issue detected for flow ${flow.flowId || "unknown"}.`,
        })),
      }),
    ]);

    emitted += 1;
  }

  return { emitted, skipped, invalidFlows: problematicFlows.length };
}
