import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { sanitizeAutomationPayload } from "./redaction";

const stableSerialize = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
};

const computeIntegrityHash = (previousHash: string | null, payload: Record<string, unknown>) =>
  createHash("sha256")
    .update(`${previousHash ?? ""}:${stableSerialize(payload)}`)
    .digest("hex");

type AutomationAuditMetadata = {
  occurredAt: string;
  userId: string;
  flowId: string;
  runId: string | null;
  event: string;
  details: Record<string, unknown>;
  chainVersion: number;
  tamperEvident: boolean;
  previousHash: string | null;
  integrityHash: string;
};

const asJsonObject = (value: Record<string, unknown>): Prisma.InputJsonValue =>
  value as Prisma.InputJsonValue;

const getPreviousHash = async (userId: string, flowId: string) => {
  const latest = await prisma.auditLog.findFirst({
    where: {
      userId,
      action: { startsWith: "AUTOMATION_AUDIT_" },
      metadata: { path: ["flowId"], equals: flowId },
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  if (!latest?.metadata || typeof latest.metadata !== "object" || Array.isArray(latest.metadata)) {
    return null;
  }
  const maybeHash = (latest.metadata as Record<string, unknown>)["integrityHash"];
  if (typeof maybeHash !== "string" || !maybeHash.trim()) return null;
  return maybeHash.trim();
};

export async function appendAutomationAuditEvent({
  userId,
  flowId,
  runId,
  event,
  details,
}: {
  userId: string;
  flowId: string;
  runId?: string | null;
  event: string;
  details?: Record<string, unknown>;
}) {
  const previousHash = await getPreviousHash(userId, flowId);
  const sanitizedDetails = sanitizeAutomationPayload(details ?? {});
  const payload = {
    occurredAt: new Date().toISOString(),
    userId,
    flowId,
    runId: runId ?? null,
    event,
    details: sanitizedDetails,
  };
  const integrityHash = computeIntegrityHash(previousHash, payload);

  await prisma.auditLog.create({
    data: {
      userId,
      action: `AUTOMATION_AUDIT_${event}`,
      metadata: asJsonObject({
        ...payload,
        chainVersion: 1,
        tamperEvident: true,
        previousHash,
        integrityHash,
      }),
    },
  });

  return { integrityHash, previousHash };
}

export function verifyAutomationAuditChain(
  entries: Array<{
    createdAt: Date;
    metadata: unknown;
  }>
) {
  let previousHash: string | null = null;
  let checked = 0;
  const invalid: Array<{ index: number; reason: string; createdAt: string }> = [];

  entries.forEach((entry, index) => {
    checked += 1;
    if (!entry.metadata || typeof entry.metadata !== "object" || Array.isArray(entry.metadata)) {
      invalid.push({ index, reason: "invalid_metadata_shape", createdAt: entry.createdAt.toISOString() });
      return;
    }

    const metadata = entry.metadata as AutomationAuditMetadata;
    const payload = {
      occurredAt: metadata.occurredAt,
      userId: metadata.userId,
      flowId: metadata.flowId,
      runId: metadata.runId ?? null,
      event: metadata.event,
      details:
        metadata.details && typeof metadata.details === "object" && !Array.isArray(metadata.details)
          ? metadata.details
          : {},
    };
    const expectedHash = computeIntegrityHash(metadata.previousHash ?? null, payload);
    if (metadata.integrityHash !== expectedHash) {
      invalid.push({ index, reason: "hash_mismatch", createdAt: entry.createdAt.toISOString() });
      previousHash = metadata.integrityHash ?? null;
      return;
    }
    if ((metadata.previousHash ?? null) !== previousHash) {
      invalid.push({ index, reason: "chain_break", createdAt: entry.createdAt.toISOString() });
      previousHash = metadata.integrityHash ?? null;
      return;
    }

    previousHash = metadata.integrityHash;
  });

  return {
    checked,
    valid: invalid.length === 0,
    invalidCount: invalid.length,
    invalid,
    lastHash: previousHash,
  };
}
