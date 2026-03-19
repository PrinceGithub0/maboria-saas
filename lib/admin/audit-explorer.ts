import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditExplorerCategory = "all" | "impersonation" | "role" | "system_flags" | "tenant";
export type AuditExplorerSource = "all" | "audit" | "system_flag";

export type AuditExplorerQuery = {
  page: number;
  pageSize: number;
  q?: string | null;
  category: AuditExplorerCategory;
  source: AuditExplorerSource;
};

export type AuditExplorerEvent = {
  id: string;
  timestamp: string;
  category: Exclude<AuditExplorerCategory, "all">;
  source: Exclude<AuditExplorerSource, "all">;
  action: string;
  message: string;
  actorName: string | null;
  actorEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
  metadata: Record<string, unknown>;
};

export type AuditExplorerResult = {
  items: AuditExplorerEvent[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

type RawAuditExplorerRow = {
  id: string;
  timestamp: Date;
  category: "IMPERSONATION" | "ROLE" | "SYSTEM_FLAGS" | "TENANT";
  source: "audit" | "system_flag";
  action: string;
  message: string;
  actorName: string | null;
  actorEmail: string | null;
  tenantId: string | null;
  tenantName: string | null;
  metadata: unknown;
};

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

const CATEGORY_MAP: Record<Exclude<AuditExplorerCategory, "all">, string> = {
  impersonation: "IMPERSONATION",
  role: "ROLE",
  system_flags: "SYSTEM_FLAGS",
  tenant: "TENANT",
};

const SOURCE_MAP: Record<Exclude<AuditExplorerSource, "all">, string> = {
  audit: "audit",
  system_flag: "system_flag",
};

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizePage(value: number) {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

function normalizePageSize(value: number) {
  if (!Number.isFinite(value) || value < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.floor(value));
}

function buildWhereClause(input: AuditExplorerQuery) {
  const clauses: Prisma.Sql[] = [];
  const search = String(input.q || "").trim();
  if (search) {
    const like = `%${search}%`;
    clauses.push(
      Prisma.sql`(
        events.action ILIKE ${like}
        OR events.message ILIKE ${like}
        OR COALESCE(events."actorName", '') ILIKE ${like}
        OR COALESCE(events."actorEmail", '') ILIKE ${like}
        OR COALESCE(events."tenantId", '') ILIKE ${like}
        OR COALESCE(events."tenantName", '') ILIKE ${like}
        OR CAST(events.metadata AS TEXT) ILIKE ${like}
      )`
    );
  }

  if (input.category !== "all") {
    clauses.push(Prisma.sql`events.category = ${CATEGORY_MAP[input.category]}`);
  }

  if (input.source !== "all") {
    clauses.push(Prisma.sql`events.source = ${SOURCE_MAP[input.source]}`);
  }

  if (!clauses.length) {
    return Prisma.empty;
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

function baseEventsCte() {
  return Prisma.sql`
    WITH events AS (
      SELECT
        CONCAT('audit:', au.id) AS id,
        au."createdAt" AS "timestamp",
        (
          CASE
            WHEN UPPER(COALESCE(au."actionType", au.action)) LIKE '%IMPERSONATION%' THEN 'IMPERSONATION'
            WHEN UPPER(COALESCE(au."actionType", au.action)) LIKE '%ROLE%' THEN 'ROLE'
            WHEN UPPER(COALESCE(au."actionType", au.action)) LIKE '%TENANT%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%SUSPEND%'
              OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%REACTIVAT%'
              THEN 'TENANT'
            ELSE 'TENANT'
          END
        ) AS category,
        'audit' AS source,
        COALESCE(au."actionType", au.action) AS action,
        COALESCE(
          au.metadata->>'message',
          au.metadata->>'reason',
          REPLACE(LOWER(COALESCE(au."actionType", au.action)), '_', ' ')
        ) AS message,
        u.name AS "actorName",
        u.email AS "actorEmail",
        COALESCE(au.metadata->>'tenantId', au.metadata->>'workspaceId', au.metadata->>'orgId', au."orgId") AS "tenantId",
        b.name AS "tenantName",
        COALESCE(au.metadata, '{}'::jsonb) AS metadata
      FROM "AuditLog" au
      LEFT JOIN "User" u ON u.id = au."userId"
      LEFT JOIN "Business" b ON b.id = COALESCE(au.metadata->>'tenantId', au.metadata->>'workspaceId', au.metadata->>'orgId', au."orgId")
      WHERE
        UPPER(COALESCE(au."actionType", au.action)) LIKE '%IMPERSONATION%'
        OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%ROLE%'
        OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%TENANT%'
        OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%SUSPEND%'
        OR UPPER(COALESCE(au."actionType", au.action)) LIKE '%REACTIVAT%'

      UNION ALL

      SELECT
        CONCAT('flag:', sf.id) AS id,
        sf."createdAt" AS "timestamp",
        'SYSTEM_FLAGS' AS category,
        'system_flag' AS source,
        'SYSTEM_FLAG_UPDATED' AS action,
        CONCAT('Flag ', sf."flagKey", ' changed from ', sf."oldValue"::text, ' to ', sf."newValue"::text) AS message,
        u.name AS "actorName",
        u.email AS "actorEmail",
        NULL::text AS "tenantId",
        NULL::text AS "tenantName",
        jsonb_build_object(
          'flagKey', sf."flagKey",
          'oldValue', sf."oldValue",
          'newValue', sf."newValue",
          'actorIp', sf."actorIp"
        ) AS metadata
      FROM "SystemFlagAuditLog" sf
      LEFT JOIN "User" u ON u.id = sf."actorUserId"
    )
  `;
}

export async function queryAuditExplorer(input: AuditExplorerQuery): Promise<AuditExplorerResult> {
  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const offset = (page - 1) * pageSize;
  const whereClause = buildWhereClause({
    ...input,
    page,
    pageSize,
  });

  const rowsQuery = Prisma.sql`
    ${baseEventsCte()}
    SELECT
      events.id,
      events."timestamp",
      events.category,
      events.source,
      events.action,
      events.message,
      events."actorName",
      events."actorEmail",
      events."tenantId",
      events."tenantName",
      events.metadata
    FROM events
    ${whereClause}
    ORDER BY events."timestamp" DESC, events.id DESC
    OFFSET ${offset}
    LIMIT ${pageSize + 1}
  `;

  const totalQuery = Prisma.sql`
    ${baseEventsCte()}
    SELECT COUNT(*)::int AS count
    FROM events
    ${whereClause}
  `;

  const [rawRows, totalRows] = await Promise.all([
    prisma.$queryRaw<RawAuditExplorerRow[]>(rowsQuery),
    prisma.$queryRaw<Array<{ count: number }>>(totalQuery),
  ]);

  const hasMore = rawRows.length > pageSize;
  const rows = rawRows.slice(0, pageSize);
  const total = Number(totalRows[0]?.count || 0);

  const items: AuditExplorerEvent[] = rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    category: row.category.toLowerCase() as Exclude<AuditExplorerCategory, "all">,
    source: row.source,
    action: row.action,
    message: row.message,
    actorName: row.actorName,
    actorEmail: row.actorEmail,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    metadata: sanitizeMetadata(row.metadata),
  }));

  return {
    items,
    page,
    pageSize,
    total,
    hasMore,
  };
}
