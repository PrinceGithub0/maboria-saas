import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const USER_ACTIVITY_EVENT_TYPES = [
  "login",
  "logout",
  "invoice_created",
  "invoice_sent",
  "invoice_paid",
  "receipt_generated",
  "automation_triggered",
  "notification_sent",
  "payment_attempt",
  "payment_failed",
  "payment_succeeded",
  "impersonation_started",
  "impersonation_ended",
] as const;

export type UserActivityEventType = (typeof USER_ACTIVITY_EVENT_TYPES)[number];

const REDACTED_KEYS = new Set([
  "token",
  "password",
  "apiKey",
  "apikey",
  "authorization",
  "cookie",
  "secret",
  "bearer",
  "otp",
  "ssn",
  "card",
  "cvv",
  "pin",
  "privatekey",
]);

const MAX_METADATA_KEYS = 40;
const MAX_STRING_LENGTH = 1_000;
const REDACTED_VALUE = "[REDACTED]";

type LogUserActivityInput = {
  tenantId?: string | null;
  userId: string;
  eventType: UserActivityEventType;
  actorId?: string | null;
  metadata?: Record<string, unknown> | null;
};

function shouldRedactKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return REDACTED_KEYS.has(normalized);
}

function sanitizeMetadataValue(value: unknown, depth = 0): Prisma.JsonValue {
  if (value === null) return null;
  if (depth > 8) return "[TRUNCATED]";

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((entry) => sanitizeMetadataValue(entry, depth + 1));
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const entries = Object.entries(objectValue).slice(0, MAX_METADATA_KEYS);
    const output: Record<string, Prisma.JsonValue> = {};
    for (const [key, rawValue] of entries) {
      output[key] = shouldRedactKey(key) ? REDACTED_VALUE : sanitizeMetadataValue(rawValue, depth + 1);
    }
    return output;
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  return String(value);
}

export function sanitizeUserActivityMetadata(metadata?: Record<string, unknown> | null): Prisma.JsonValue {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return sanitizeMetadataValue(metadata);
}

async function resolveTenantIdForUser(userId: string) {
  const membership = await prisma.businessMember.findFirst({
    where: { userId, status: "active" },
    orderBy: [{ joinedAt: "desc" }, { createdAt: "desc" }],
    select: { businessId: true },
  });
  return membership?.businessId || null;
}

export async function logUserActivity(input: LogUserActivityInput) {
  try {
    const tenantId = input.tenantId || (await resolveTenantIdForUser(input.userId));
    if (!tenantId) return;
    const metadata = sanitizeUserActivityMetadata(input.metadata) as Prisma.InputJsonValue;

    await prisma.userActivityLog.create({
      data: {
        tenantId,
        userId: input.userId,
        eventType: input.eventType,
        actorId: input.actorId || null,
        metadata,
      },
    });
  } catch (error) {
    console.error("user_activity_log_failed", {
      eventType: input.eventType,
      userId: input.userId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
