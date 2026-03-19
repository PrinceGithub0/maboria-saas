import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SYSTEM_LOG_RETENTION_DAYS = 30;
const MAX_EXPORT_ROWS = 5000;

export type SystemLogSeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL";
export type SystemLogActor = "user" | "admin" | "system";
export type SystemLogTab = "all" | "errors" | "security" | "webhooks" | "billing" | "infrastructure";

export type SystemLogRecord = {
  id: string;
  source: "activity" | "audit" | "webhook";
  timestamp: string;
  severity: SystemLogSeverity;
  service: string;
  message: string;
  actor: SystemLogActor;
  actorId: string | null;
  actorName: string | null;
  tenantId: string | null;
  scope: "tenant" | "global";
  requestId: string | null;
  correlationId: string | null;
  eventId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
};

export type SystemLogQueryInput = {
  page: number;
  pageSize: number;
  tab: SystemLogTab;
  cursor?: string | null;
  includeTotal?: boolean;
  q?: string | null;
  severities?: SystemLogSeverity[];
  services?: string[];
  actor?: SystemLogActor | null;
  tenant?: string | null;
  from?: Date | null;
  to?: Date | null;
  requestId?: string | null;
  correlationId?: string | null;
  eventId?: string | null;
  exportAll?: boolean;
};

export type SystemLogQueryResult = {
  items: SystemLogRecord[];
  total: number | null;
  page: number;
  pageSize: number;
  showingFrom: number;
  showingTo: number;
  hasMore: boolean;
  nextCursor: string | null;
  highVolumeDetected: boolean;
  highVolumeCount: number;
  retentionDays: number;
};

type RawSystemLogRow = {
  id: string;
  source: string;
  timestamp: Date | string;
  severity: string;
  service: string;
  message: string;
  actor: string;
  actorId: string | null;
  actorName: string | null;
  tenantId: string | null;
  scope: string;
  requestId: string | null;
  correlationId: string | null;
  eventId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Prisma.JsonValue | null;
};

const SENSITIVE_METADATA_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /cookie/i,
  /api[_-]?key/i,
  /credential/i,
  /private[_-]?key/i,
];

function redactMetadata<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactMetadata(entry)) as T;
  }
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(input)) {
    const isSensitive = SENSITIVE_METADATA_KEY_PATTERNS.some((pattern) => pattern.test(key));
    output[key] = isSensitive ? "[REDACTED]" : redactMetadata(entry);
  }
  return output as T;
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return redactMetadata(value as Record<string, unknown>);
}

function withinRetentionRange(from?: Date | null, to?: Date | null) {
  const now = new Date();
  const minFrom = new Date(now.getTime() - SYSTEM_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const normalizedTo = to && !Number.isNaN(to.getTime()) ? to : now;
  const normalizedFromRaw = from && !Number.isNaN(from.getTime()) ? from : minFrom;
  const normalizedFrom = normalizedFromRaw < minFrom ? minFrom : normalizedFromRaw;
  return normalizedFrom <= normalizedTo
    ? { from: normalizedFrom, to: normalizedTo }
    : { from: normalizedTo, to: normalizedFrom };
}

function asNumber(value: bigint | number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

function encodeCursor(input: { timestamp: string; id: string }) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function decodeCursor(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { timestamp?: string; id?: string };
    if (!parsed.timestamp || !parsed.id) return null;
    const ts = new Date(parsed.timestamp);
    if (Number.isNaN(ts.getTime())) return null;
    return { timestamp: ts, id: String(parsed.id) };
  } catch {
    return null;
  }
}

function normalizeStringArray(values: string[] | undefined, uppercase = false) {
  return (values || [])
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((value) => (uppercase ? value.toUpperCase() : value));
}

function logsCteSql(range: { from: Date; to: Date }) {
  return Prisma.sql`
    WITH logs AS (
      SELECT
        CONCAT('activity:', al.id) AS id,
        'activity' AS source,
        al."timestamp" AS "timestamp",
        (
          CASE
            WHEN UPPER(al.action) LIKE '%SYSTEM_OUTAGE%'
              OR UPPER(al.action) LIKE '%SECURITY_BREACH%'
              OR UPPER(al.action) LIKE '%UNAUTHORIZED_ADMIN%'
              OR UPPER(COALESCE(al.metadata->>'scope', '')) = 'GLOBAL_FAILURE'
              THEN 'CRITICAL'
            WHEN UPPER(al.action) LIKE '%FAILED%'
              OR UPPER(al.action) LIKE '%ERROR%'
              OR UPPER(al.action) LIKE '%BREACH%'
              OR UPPER(al.action) LIKE '%REVOKED%'
              OR UPPER(al.action) LIKE '%PAST_DUE%'
              THEN 'ERROR'
            WHEN UPPER(al.action) LIKE '%WARN%'
              OR UPPER(al.action) LIKE '%RETRY%'
              OR UPPER(al.action) LIKE '%REPLAY%'
              OR UPPER(al.action) LIKE '%PENDING%'
              THEN 'WARN'
            ELSE 'INFO'
          END
        ) AS severity,
        (
          CASE
            WHEN UPPER(al.action) LIKE '%WEBHOOK%' THEN 'WEBHOOKS'
            WHEN UPPER(al.action) LIKE '%SUPPORT%' OR UPPER(al.action) LIKE '%TICKET%' THEN 'SUPPORT'
            WHEN UPPER(al.action) LIKE '%SUBSCRIPTION%'
              OR UPPER(al.action) LIKE '%PAYMENT%'
              OR UPPER(al.action) LIKE '%INVOICE%'
              OR UPPER(al.action) LIKE '%BILLING%'
              THEN 'BILLING'
            WHEN UPPER(al.action) LIKE '%AUTH%'
              OR UPPER(al.action) LIKE '%PASSWORD%'
              OR UPPER(al.action) LIKE '%2FA%'
              OR UPPER(al.action) LIKE '%IMPERSONATION%'
              OR UPPER(al.action) LIKE '%SECURITY%'
              THEN 'SECURITY'
            WHEN UPPER(al.action) LIKE '%AUTOMATION%' THEN 'AUTOMATION'
            WHEN UPPER(al.action) LIKE '%SYSTEM%'
              OR UPPER(al.action) LIKE '%OUTAGE%'
              OR UPPER(al.action) LIKE '%DATABASE%'
              OR UPPER(al.action) LIKE '%QUEUE%'
              OR UPPER(al.action) LIKE '%WORKER%'
              OR UPPER(al.action) LIKE '%INFRA%'
              THEN 'INFRASTRUCTURE'
            ELSE 'CORE'
          END
        ) AS service,
        COALESCE(al.metadata->>'message', al.metadata->>'summary', REPLACE(LOWER(al.action), '_', ' ')) AS message,
        (
          CASE
            WHEN al."userId" IS NULL THEN 'system'
            WHEN COALESCE(u."isPlatformUser", FALSE) = TRUE
              OR UPPER(COALESCE(u.role::text, '')) IN ('OPS_ADMIN', 'SUPER_ADMIN')
              OR UPPER(al.action) LIKE '%ADMIN_%'
              THEN 'admin'
            ELSE 'user'
          END
        ) AS actor,
        al."userId" AS "actorId",
        u.name AS "actorName",
        COALESCE(
          al.metadata->>'tenantId',
          al.metadata->>'workspaceId',
          al.metadata->>'businessId',
          al.metadata->>'orgId'
        ) AS "tenantId",
        (
          CASE
            WHEN COALESCE(
              al.metadata->>'tenantId',
              al.metadata->>'workspaceId',
              al.metadata->>'businessId',
              al.metadata->>'orgId'
            ) IS NULL THEN 'global'
            ELSE 'tenant'
          END
        ) AS scope,
        COALESCE(al.metadata->>'requestId', al.metadata->>'request_id') AS "requestId",
        COALESCE(al.metadata->>'correlationId', al.metadata->>'correlation_id') AS "correlationId",
        COALESCE(al.metadata->>'eventId', al.metadata->>'event_id') AS "eventId",
        COALESCE(al.ip, al.metadata->>'ip') AS ip,
        COALESCE(al."userAgent", al.metadata->>'userAgent', al.metadata->>'user_agent') AS "userAgent",
        COALESCE(al.metadata, '{}'::jsonb) AS metadata
      FROM "ActivityLog" al
      LEFT JOIN "User" u ON u.id = al."userId"
      WHERE al."timestamp" >= ${range.from} AND al."timestamp" <= ${range.to}

      UNION ALL

      SELECT
        CONCAT('audit:', au.id) AS id,
        'audit' AS source,
        au."createdAt" AS "timestamp",
        (
          CASE
            WHEN UPPER(COALESCE(au."actionType", au.action)) LIKE '%SYSTEM_OUTAGE%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%SECURITY_BREACH%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%UNAUTHORIZED_ADMIN%'
              OR UPPER(COALESCE(au.metadata->>'scope', '')) = 'GLOBAL_FAILURE'
              THEN 'CRITICAL'
            WHEN UPPER(COALESCE(au."actionType", au.action)) LIKE '%FAILED%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%ERROR%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%BREACH%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%REVOKED%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%PAST_DUE%'
              THEN 'ERROR'
            WHEN UPPER(COALESCE(au."actionType", au.action)) LIKE '%WARN%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%RETRY%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%REPLAY%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%PENDING%'
              THEN 'WARN'
            ELSE 'INFO'
          END
        ) AS severity,
        (
          CASE
            WHEN UPPER(COALESCE(au."actionType", au.action)) LIKE '%WEBHOOK%' THEN 'WEBHOOKS'
            WHEN UPPER(COALESCE(au."actionType", au.action)) LIKE '%SUPPORT%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%TICKET%'
              THEN 'SUPPORT'
            WHEN UPPER(COALESCE(au."actionType", au.action)) LIKE '%SUBSCRIPTION%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%PAYMENT%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%INVOICE%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%BILLING%'
              THEN 'BILLING'
            WHEN UPPER(COALESCE(au."actionType", au.action)) LIKE '%AUTH%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%PASSWORD%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%2FA%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%IMPERSONATION%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%SECURITY%'
              THEN 'SECURITY'
            WHEN UPPER(COALESCE(au."actionType", au.action)) LIKE '%AUTOMATION%' THEN 'AUTOMATION'
            WHEN UPPER(COALESCE(au."actionType", au.action)) LIKE '%SYSTEM%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%OUTAGE%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%DATABASE%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%QUEUE%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%WORKER%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%INFRA%'
              THEN 'INFRASTRUCTURE'
            ELSE 'CORE'
          END
        ) AS service,
        COALESCE(au.metadata->>'message', au.metadata->>'summary', REPLACE(LOWER(COALESCE(au."actionType", au.action)), '_', ' ')) AS message,
        (
          CASE
            WHEN au."userId" IS NULL THEN 'system'
            WHEN COALESCE(u."isPlatformUser", FALSE) = TRUE
              OR UPPER(COALESCE(u.role::text, '')) IN ('OPS_ADMIN', 'SUPER_ADMIN')
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%ADMIN_%'
              THEN 'admin'
            ELSE 'user'
          END
        ) AS actor,
        au."userId" AS "actorId",
        u.name AS "actorName",
        COALESCE(
          au.metadata->>'tenantId',
          au.metadata->>'workspaceId',
          au.metadata->>'businessId',
          au.metadata->>'orgId',
          au."orgId"
        ) AS "tenantId",
        (
          CASE
            WHEN COALESCE(
              au.metadata->>'tenantId',
              au.metadata->>'workspaceId',
              au.metadata->>'businessId',
              au.metadata->>'orgId',
              au."orgId"
            ) IS NULL THEN 'global'
            ELSE 'tenant'
          END
        ) AS scope,
        COALESCE(au.metadata->>'requestId', au.metadata->>'request_id') AS "requestId",
        COALESCE(au.metadata->>'correlationId', au.metadata->>'correlation_id') AS "correlationId",
        COALESCE(au.metadata->>'eventId', au.metadata->>'event_id') AS "eventId",
        au.metadata->>'ip' AS ip,
        COALESCE(au.metadata->>'userAgent', au.metadata->>'user_agent') AS "userAgent",
        COALESCE(au.metadata, '{}'::jsonb) AS metadata
      FROM "AuditLog" au
      LEFT JOIN "User" u ON u.id = au."userId"
      WHERE au."createdAt" >= ${range.from} AND au."createdAt" <= ${range.to}

      UNION ALL

      SELECT
        CONCAT('webhook:', wh.id) AS id,
        'webhook' AS source,
        wh."receivedAt" AS "timestamp",
        (
          CASE
            WHEN UPPER(wh.status) = 'FAILED' THEN 'ERROR'
            WHEN UPPER(wh.status) = 'REPLAY_REQUESTED' THEN 'WARN'
            ELSE 'INFO'
          END
        ) AS severity,
        'WEBHOOKS' AS service,
        COALESCE(wh.error, CONCAT('Webhook ', UPPER(wh.provider), ' event ', wh."eventId", ' ', LOWER(wh.status))) AS message,
        'system' AS actor,
        NULL::text AS "actorId",
        NULL::text AS "actorName",
        NULL::text AS "tenantId",
        'global' AS scope,
        NULL::text AS "requestId",
        NULL::text AS "correlationId",
        wh."eventId" AS "eventId",
        NULL::text AS ip,
        NULL::text AS "userAgent",
        jsonb_build_object('provider', wh.provider, 'status', wh.status, 'error', wh.error) AS metadata
      FROM "WebhookEvent" wh
      WHERE wh."receivedAt" >= ${range.from} AND wh."receivedAt" <= ${range.to}
    )
  `;
}

function buildFilterClauses(input: SystemLogQueryInput) {
  const clauses: Prisma.Sql[] = [];
  const severityValues = normalizeStringArray(input.severities as unknown as string[] | undefined, true);
  const serviceValues = normalizeStringArray(input.services, true);
  const actorValue = input.actor ? String(input.actor).toLowerCase() : "";
  const tenantValue = String(input.tenant || "").trim();
  const requestIdValue = String(input.requestId || "").trim();
  const correlationIdValue = String(input.correlationId || "").trim();
  const eventIdValue = String(input.eventId || "").trim();
  const qValue = String(input.q || "").trim();

  if (input.tab === "errors") {
    clauses.push(Prisma.sql`(l.severity = 'ERROR' OR l.severity = 'CRITICAL')`);
  } else if (input.tab === "security") {
    clauses.push(Prisma.sql`l.service = 'SECURITY'`);
  } else if (input.tab === "webhooks") {
    clauses.push(Prisma.sql`l.service = 'WEBHOOKS'`);
  } else if (input.tab === "billing") {
    clauses.push(Prisma.sql`l.service = 'BILLING'`);
  } else if (input.tab === "infrastructure") {
    clauses.push(Prisma.sql`l.service = 'INFRASTRUCTURE'`);
  }

  if (severityValues.length) {
    clauses.push(Prisma.sql`l.severity IN (${Prisma.join(severityValues)})`);
  }

  if (serviceValues.length) {
    clauses.push(Prisma.sql`l.service IN (${Prisma.join(serviceValues)})`);
  }

  if (actorValue) {
    clauses.push(Prisma.sql`l.actor = ${actorValue}`);
  }

  if (tenantValue) {
    clauses.push(Prisma.sql`COALESCE(l."tenantId", '') ILIKE ${`%${tenantValue}%`}`);
  }

  if (requestIdValue) {
    clauses.push(Prisma.sql`COALESCE(l."requestId", '') ILIKE ${`%${requestIdValue}%`}`);
  }

  if (correlationIdValue) {
    clauses.push(Prisma.sql`COALESCE(l."correlationId", '') ILIKE ${`%${correlationIdValue}%`}`);
  }

  if (eventIdValue) {
    clauses.push(Prisma.sql`COALESCE(l."eventId", '') ILIKE ${`%${eventIdValue}%`}`);
  }

  if (qValue) {
    const pattern = `%${qValue}%`;
    clauses.push(
      Prisma.sql`(
        l.message ILIKE ${pattern}
        OR COALESCE(l."requestId", '') ILIKE ${pattern}
        OR COALESCE(l."correlationId", '') ILIKE ${pattern}
        OR COALESCE(l."eventId", '') ILIKE ${pattern}
        OR l.service ILIKE ${pattern}
      )`
    );
  }

  return clauses;
}

function toWhereSql(clauses: Prisma.Sql[]) {
  if (!clauses.length) return Prisma.empty;
  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

function mapRawRow(row: RawSystemLogRow): SystemLogRecord {
  return {
    id: row.id,
    source: row.source as SystemLogRecord["source"],
    timestamp: new Date(row.timestamp).toISOString(),
    severity: row.severity as SystemLogSeverity,
    service: row.service,
    message: row.message,
    actor: row.actor as SystemLogActor,
    actorId: row.actorId,
    actorName: row.actorName,
    tenantId: row.tenantId,
    scope: row.scope as "tenant" | "global",
    requestId: row.requestId,
    correlationId: row.correlationId,
    eventId: row.eventId,
    ip: row.ip,
    userAgent: row.userAgent,
    metadata: normalizeMetadata(row.metadata),
  };
}

export async function querySystemLogs(input: SystemLogQueryInput): Promise<SystemLogQueryResult> {
  const page = Math.max(1, Math.floor(input.page || 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(input.pageSize || 50)));
  const range = withinRetentionRange(input.from, input.to);
  const filterClauses = buildFilterClauses(input);
  const baseCte = logsCteSql(range);
  const limit = input.exportAll ? MAX_EXPORT_ROWS : pageSize + 1;
  const cursor = decodeCursor(input.cursor);
  const offset = input.exportAll ? 0 : cursor ? 0 : (page - 1) * pageSize;
  const displayOffset = input.exportAll ? 0 : (page - 1) * pageSize;
  const dataClauses = cursor
    ? [
        ...filterClauses,
        Prisma.sql`(l."timestamp" < ${cursor.timestamp} OR (l."timestamp" = ${cursor.timestamp} AND l.id < ${cursor.id}))`,
      ]
    : filterClauses;
  const whereForCount = toWhereSql(filterClauses);
  const whereForData = toWhereSql(dataClauses);

  const countQuery =
    input.includeTotal || page === 1
      ? prisma.$queryRaw<Array<{ total: bigint }>>(
          Prisma.sql`
            ${baseCte}
            SELECT COUNT(*)::bigint AS total
            FROM logs l
            ${whereForCount}
          `
        )
      : Promise.resolve([] as Array<{ total: bigint }>);

  const [countRows, rawRows, activityRecent, auditRecent, webhookRecent] = await Promise.all([
    countQuery,
    prisma.$queryRaw<RawSystemLogRow[]>(
      Prisma.sql`
        ${baseCte}
        SELECT
          l.id,
          l.source,
          l."timestamp",
          l.severity,
          l.service,
          l.message,
          l.actor,
          l."actorId",
          l."actorName",
          l."tenantId",
          l.scope,
          l."requestId",
          l."correlationId",
          l."eventId",
          l.ip,
          l."userAgent",
          l.metadata
        FROM logs l
        ${whereForData}
        ORDER BY l."timestamp" DESC
        LIMIT ${limit}
        ${input.exportAll ? Prisma.empty : Prisma.sql`OFFSET ${offset}`}
      `
    ),
    prisma.activityLog.count({
      where: {
        timestamp: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    }),
    prisma.auditLog.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    }),
    prisma.webhookEvent.count({
      where: {
        receivedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    }),
  ]);

  const hasMore = !input.exportAll && rawRows.length > pageSize;
  const pageRows = hasMore ? rawRows.slice(0, pageSize) : rawRows;
  const items = pageRows.map(mapRawRow);
  const nextCursor =
    hasMore && items.length
      ? encodeCursor({
          timestamp: items[items.length - 1].timestamp,
          id: items[items.length - 1].id,
        })
      : null;
  const total = countRows.length ? asNumber(countRows[0]?.total) : null;
  const showingFrom = total === 0 ? 0 : displayOffset + 1;
  const showingTo =
    total === 0
      ? 0
      : total !== null
        ? Math.min(displayOffset + items.length, total)
        : displayOffset + items.length;
  const highVolumeCount = activityRecent + auditRecent + webhookRecent;
  const highVolumeDetected = highVolumeCount >= 200;

  return {
    items,
    total,
    page,
    pageSize,
    showingFrom,
    showingTo,
    hasMore,
    nextCursor,
    highVolumeDetected,
    highVolumeCount,
    retentionDays: SYSTEM_LOG_RETENTION_DAYS,
  };
}
