import { createHash } from "crypto";

export type VerifiedAutomationEventType =
  | "invoice.status.changed"
  | "payment.verified"
  | "webhook.received"
  | "manual.run";

type EventRecord = Record<string, unknown>;

export type VerifiedAutomationEvent = {
  type: VerifiedAutomationEventType;
  eventId: string;
  idempotencyKey: string;
  occurredAt: string;
  userId: string;
  businessId?: string | null;
  source: string;
  invoice?: EventRecord;
  payment?: EventRecord;
  customer?: EventRecord;
  metadata?: EventRecord;
};

type BuildVerifiedAutomationEventInput = {
  type: VerifiedAutomationEventType;
  userId: string;
  source: string;
  eventId?: string | null;
  occurredAt?: string | Date | null;
  businessId?: string | null;
  invoice?: EventRecord;
  payment?: EventRecord;
  customer?: EventRecord;
  metadata?: EventRecord;
};

const normalizeDate = (value?: string | Date | null) => {
  if (!value) return new Date().toISOString();
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const stableSerialize = (value: unknown): string => {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${key}:${stableSerialize(entry)}`).join(",")}}`;
};

const hashValue = (value: string) => createHash("sha256").update(value).digest("hex");

const resolveEventId = (input: BuildVerifiedAutomationEventInput, occurredAt: string) => {
  const explicit = String(input.eventId || "").trim();
  if (explicit) return explicit;
  const fingerprint = stableSerialize({
    type: input.type,
    source: input.source,
    userId: input.userId,
    occurredAt,
    invoice: input.invoice,
    payment: input.payment,
    customer: input.customer,
    metadata: input.metadata,
  });
  return `evt_${hashValue(fingerprint).slice(0, 24)}`;
};

export const buildAutomationIdempotencyKey = ({
  userId,
  type,
  source,
  eventId,
}: {
  userId: string;
  type: VerifiedAutomationEventType;
  source: string;
  eventId: string;
}) => hashValue(`${userId}|${type}|${source}|${eventId}`);

export const buildVerifiedAutomationEvent = (
  input: BuildVerifiedAutomationEventInput
): VerifiedAutomationEvent => {
  const occurredAt = normalizeDate(input.occurredAt);
  const eventId = resolveEventId(input, occurredAt);
  return {
    type: input.type,
    userId: input.userId,
    businessId: input.businessId ?? null,
    source: input.source,
    occurredAt,
    eventId,
    idempotencyKey: buildAutomationIdempotencyKey({
      userId: input.userId,
      type: input.type,
      source: input.source,
      eventId,
    }),
    invoice: input.invoice,
    payment: input.payment,
    customer: input.customer,
    metadata: input.metadata,
  };
};
