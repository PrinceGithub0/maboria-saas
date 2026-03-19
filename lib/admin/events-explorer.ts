import "server-only";

import type { Prisma, SystemEventSeverity, SystemEventSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sanitizeSystemEventMetadata } from "@/lib/system-events";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_QUERY_WINDOW_DAYS = 90;

export type EventsExplorerQueryInput = {
  actorRole: "SUPER_ADMIN" | "OPS_ADMIN";
  q?: string | null;
  severity?: SystemEventSeverity | null;
  source?: SystemEventSource | null;
  eventType?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  entityId?: string | null;
  from?: Date | null;
  to?: Date | null;
  cursor?: string | null;
  limit?: number | null;
};

function normalizeTenantIds(value?: string | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export type EventsExplorerItem = {
  id: string;
  createdAt: string;
  severity: SystemEventSeverity;
  source: SystemEventSource;
  eventType: string;
  tenant: { id: string; name: string } | null;
  user: { id: string; email: string; name: string | null } | null;
  actor: { id: string; email: string; name: string | null } | null;
  entityType: string | null;
  entityId: string | null;
  message: string;
  requestId: string | null;
  metadata: Record<string, unknown>;
};

export type EventsExplorerResult = {
  items: EventsExplorerItem[];
  nextCursor: string | null;
  totalCount: number | null;
};

function encodeCursor(input: { createdAt: string; id: string }) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function decodeCursor(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      createdAt?: string;
      id?: string;
    };
    if (!parsed.id || !parsed.createdAt) return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { id: String(parsed.id), createdAt };
  } catch {
    return null;
  }
}

function normalizeRange(from?: Date | null, to?: Date | null) {
  const now = new Date();
  const floor = new Date(now.getTime() - MAX_QUERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const safeTo = to && !Number.isNaN(to.getTime()) ? to : now;
  const safeFromRaw = from && !Number.isNaN(from.getTime()) ? from : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const safeFrom = safeFromRaw < floor ? floor : safeFromRaw;
  return safeFrom <= safeTo ? { from: safeFrom, to: safeTo } : { from: safeTo, to: safeFrom };
}

function normalizeLimit(value?: number | null) {
  if (!Number.isFinite(value) || !value || value < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(value));
}

export async function queryEventsExplorer(input: EventsExplorerQueryInput): Promise<EventsExplorerResult> {
  const limit = normalizeLimit(input.limit);
  const cursor = decodeCursor(input.cursor);
  const range = normalizeRange(input.from, input.to);
  const q = String(input.q || "").trim().slice(0, 120);

  const where: Prisma.SystemEventWhereInput = {
    createdAt: {
      gte: range.from,
      lte: range.to,
    },
  };

  if (input.severity) where.severity = input.severity;
  if (input.source) where.source = input.source;
  if (input.eventType) where.eventType = { equals: String(input.eventType).trim(), mode: "insensitive" };
  if (input.userId) where.userId = String(input.userId).trim();
  if (input.entityId) where.entityId = { contains: String(input.entityId).trim(), mode: "insensitive" };
  if (input.actorRole === "SUPER_ADMIN" && input.tenantId) {
    const tenantIds = normalizeTenantIds(input.tenantId);
    if (tenantIds.length === 1) {
      where.tenantId = tenantIds[0];
    } else if (tenantIds.length > 1) {
      where.tenantId = { in: tenantIds };
    }
  }

  if (q) {
    where.OR = [
      { message: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { requestId: { contains: q, mode: "insensitive" } },
      { eventType: { contains: q, mode: "insensitive" } },
      { user: { is: { email: { contains: q, mode: "insensitive" } } } },
      { user: { is: { name: { contains: q, mode: "insensitive" } } } },
      { tenant: { is: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const cursorWhere: Prisma.SystemEventWhereInput | null = cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : null;

  const finalWhere = cursorWhere ? ({ AND: [where, cursorWhere] } as Prisma.SystemEventWhereInput) : where;

  const rows = await prisma.systemEvent.findMany({
    where: finalWhere,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      actor: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const last = visible[visible.length - 1];

  return {
    items: visible.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      severity: row.severity,
      source: row.source,
      eventType: row.eventType,
      tenant: row.tenant ? { id: row.tenant.id, name: row.tenant.name } : null,
      user: row.user ? { id: row.user.id, email: row.user.email, name: row.user.name || null } : null,
      actor: row.actor ? { id: row.actor.id, email: row.actor.email, name: row.actor.name || null } : null,
      entityType: row.entityType || null,
      entityId: row.entityId || null,
      message: row.message,
      requestId: row.requestId || null,
      metadata: sanitizeSystemEventMetadata(
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {}
      ) as Record<string, unknown>,
    })),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
    totalCount: null,
  };
}
