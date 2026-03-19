import "server-only";

import type { Prisma, PrismaClient, SystemEventSeverity, SystemEventSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const REDACTED_VALUE = "[REDACTED]";
const MAX_METADATA_KEYS = 60;
const MAX_ARRAY_ITEMS = 40;
const MAX_STRING_LENGTH = 2_000;
const MAX_DEPTH = 8;

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /password/i,
  /secret/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /bearer/i,
  /private[_-]?key/i,
];

const HIGH_ENTROPY_VALUE = /^[A-Za-z0-9+/_=-]{32,}$/;

type SystemEventClient = PrismaClient | Prisma.TransactionClient;

export type EmitSystemEventInput = {
  tenantId?: string | null;
  userId?: string | null;
  actorId?: string | null;
  eventType: string;
  severity?: SystemEventSeverity;
  source: SystemEventSource;
  entityType?: string | null;
  entityId?: string | null;
  message: string;
  metadata?: Record<string, unknown> | null;
  requestId?: string | null;
  createdAt?: Date | null;
};

function shouldRedactKey(key: string) {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeValue(value: unknown, depth = 0): Prisma.JsonValue {
  if (value === null) return null;
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, Prisma.JsonValue> = {};
    for (const [key, entry] of Object.entries(input).slice(0, MAX_METADATA_KEYS)) {
      output[key] = shouldRedactKey(key) ? REDACTED_VALUE : sanitizeValue(entry, depth + 1);
    }
    return output;
  }

  if (typeof value === "string") {
    if (HIGH_ENTROPY_VALUE.test(value) && value.length >= 40) {
      return REDACTED_VALUE;
    }
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  return String(value);
}

export function sanitizeSystemEventMetadata(metadata?: Record<string, unknown> | null): Prisma.InputJsonValue {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return sanitizeValue(metadata) as Prisma.InputJsonValue;
}

export function shouldSeedDevelopmentSystemEvents(env = process.env.NODE_ENV) {
  return env === "development" || env === "test";
}

export async function emitSystemEvent(
  input: EmitSystemEventInput,
  options?: { tx?: Prisma.TransactionClient }
) {
  try {
    const client: SystemEventClient = options?.tx || prisma;
    await client.systemEvent.create({
      data: {
        tenantId: input.tenantId || null,
        userId: input.userId || null,
        actorId: input.actorId || null,
        eventType: String(input.eventType).trim(),
        severity: input.severity || "INFO",
        source: input.source,
        entityType: input.entityType || null,
        entityId: input.entityId || null,
        message: String(input.message).trim().slice(0, 2000),
        metadata: sanitizeSystemEventMetadata(input.metadata),
        requestId: input.requestId || null,
        createdAt: input.createdAt || undefined,
      },
    });
  } catch (error) {
    console.error("system_event_emit_failed", {
      eventType: input.eventType,
      source: input.source,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
