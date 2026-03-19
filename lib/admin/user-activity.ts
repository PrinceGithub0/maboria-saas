import { prisma } from "@/lib/prisma";
import { getActorSystemFlagRole } from "@/lib/system-flags";
import {
  USER_ACTIVITY_EVENT_TYPES,
  sanitizeUserActivityMetadata,
  type UserActivityEventType,
} from "@/lib/user-activity";

class UserActivityHttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "SERVER_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type UserActivityTimelineItem = {
  id: string;
  eventType: UserActivityEventType;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type UserActivityTimelineResponse = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  items: UserActivityTimelineItem[];
  pagination: {
    mode: "offset" | "cursor";
    page: number;
    pageSize: number;
    totalItems: number | null;
    totalPages: number | null;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

function parsePage(value?: string | null, fallback = 1) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parsePageSize(value?: string | null, fallback = 50) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
}

type ActivityCursor = {
  createdAt: string;
  id: string;
};

function encodeCursor(value: ActivityCursor) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeCursor(value?: string | null): ActivityCursor | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as ActivityCursor;
    if (!parsed?.id || !parsed?.createdAt) return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { id: String(parsed.id), createdAt: createdAt.toISOString() };
  } catch {
    return null;
  }
}

function normalizeEventType(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (USER_ACTIVITY_EVENT_TYPES.includes(normalized as UserActivityEventType)) {
    return normalized as UserActivityEventType;
  }
  return null;
}

function parseDate(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

async function resolveAdminScope(actorId: string, targetUserIdentifier: string) {
  const targetIdentifier = String(targetUserIdentifier || "").trim();
  if (!targetIdentifier) {
    throw new UserActivityHttpError(404, "User not found.", "NOT_FOUND");
  }

  const role = await getActorSystemFlagRole(actorId);
  if (role !== "OPS_ADMIN" && role !== "SUPER_ADMIN") {
    throw new UserActivityHttpError(403, "Forbidden", "FORBIDDEN");
  }

  const targetUser = await prisma.user.findFirst({
    where: {
      OR: [{ id: targetIdentifier }, { publicId: targetIdentifier }],
    },
    select: { id: true, name: true, email: true },
  });
  if (!targetUser) {
    throw new UserActivityHttpError(404, "User not found.", "NOT_FOUND");
  }

  if (role === "SUPER_ADMIN") {
    return {
      role,
      targetUser: {
        id: targetUser.id,
        name: targetUser.name || "Unnamed user",
        email: targetUser.email,
      },
      tenantScope: null as string[] | null,
    };
  }

  return {
    role,
    targetUser: {
      id: targetUser.id,
      name: targetUser.name || "Unnamed user",
      email: targetUser.email,
    },
    tenantScope: null as string[] | null,
  };
}

export async function listUserActivityTimeline(input: {
  actorId: string;
  userId: string;
  cursor?: string | null;
  cursorMode?: boolean;
  eventType?: string | null;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  page?: string | null;
  pageSize?: string | null;
}): Promise<UserActivityTimelineResponse> {
  const page = parsePage(input.page, 1);
  const pageSize = parsePageSize(input.pageSize, 50);
  const decodedCursor = decodeCursor(input.cursor);
  const eventType = normalizeEventType(input.eventType);
  const from = parseDate(input.from);
  const to = parseDate(input.to);
  const q = String(input.q || "").trim().slice(0, 120);

  const scope = await resolveAdminScope(input.actorId, input.userId);

  const where: any = {
    userId: scope.targetUser.id,
  };
  if (scope.tenantScope) {
    where.tenantId = { in: scope.tenantScope };
  }
  if (eventType) {
    where.eventType = eventType;
  }
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }
  if (q) {
    where.OR = [
      { eventType: { contains: q, mode: "insensitive" } },
      { actor: { is: { name: { contains: q, mode: "insensitive" } } } },
      { actor: { is: { email: { contains: q, mode: "insensitive" } } } },
      { metadata: { path: ["invoice_id"], string_contains: q } },
      { metadata: { path: ["invoiceId"], string_contains: q } },
      { metadata: { path: ["receipt_id"], string_contains: q } },
      { metadata: { path: ["receiptId"], string_contains: q } },
      { metadata: { path: ["automation_id"], string_contains: q } },
      { metadata: { path: ["automationId"], string_contains: q } },
      { metadata: { path: ["reference"], string_contains: q } },
      { metadata: { path: ["ticketId"], string_contains: q } },
    ];
  }

  const runCursorMode = Boolean(input.cursorMode);
  const cursorWhere = runCursorMode
    ? {
        OR: decodedCursor
          ? [
              { createdAt: { lt: new Date(decodedCursor.createdAt) } },
              {
                createdAt: new Date(decodedCursor.createdAt),
                id: { lt: decodedCursor.id },
              },
            ]
          : undefined,
      }
    : undefined;

  if (runCursorMode) {
    const rows = await prisma.userActivityLog.findMany({
      where: cursorWhere?.OR ? { AND: [where, cursorWhere] } : where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const hasMore = rows.length > pageSize;
    const visibleRows = hasMore ? rows.slice(0, pageSize) : rows;
    const lastVisible = visibleRows[visibleRows.length - 1];
    const nextCursor = hasMore && lastVisible ? encodeCursor({ id: lastVisible.id, createdAt: lastVisible.createdAt.toISOString() }) : null;

    return {
      user: scope.targetUser,
      items: visibleRows.map((row) => ({
        id: row.id,
        eventType: row.eventType as UserActivityEventType,
        actorId: row.actorId || null,
        actorName: row.actor?.name || null,
        actorEmail: row.actor?.email || null,
        metadata:
          (sanitizeUserActivityMetadata(
            row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
              ? (row.metadata as Record<string, unknown>)
              : {}
          ) as Record<string, unknown>),
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: {
        mode: "cursor",
        page: 1,
        pageSize,
        totalItems: null,
        totalPages: null,
        hasMore,
        nextCursor,
      },
    };
  }

  const [totalItems, rows] = await Promise.all([
    prisma.userActivityLog.count({ where }),
    prisma.userActivityLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return {
    user: scope.targetUser,
    items: rows.map((row) => ({
      id: row.id,
      eventType: row.eventType as UserActivityEventType,
      actorId: row.actorId || null,
      actorName: row.actor?.name || null,
      actorEmail: row.actor?.email || null,
      metadata:
        (sanitizeUserActivityMetadata(
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {}
        ) as Record<string, unknown>),
      createdAt: row.createdAt.toISOString(),
    })),
    pagination: {
      mode: "offset",
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      hasMore: page * pageSize < totalItems,
      nextCursor: null,
    },
  };
}

export function toUserActivityHttpError(error: unknown) {
  if (error instanceof UserActivityHttpError) return error;
  return new UserActivityHttpError(500, error instanceof Error ? error.message : "Server error", "SERVER_ERROR");
}
