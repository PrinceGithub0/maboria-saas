import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { AdminNotificationSeverity, AdminNotificationStatus, AdminNotificationType } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { buildAdminNotificationWhere, sanitizeAdminNotificationMetadata } from "@/lib/admin/notifications";
import { requireSystemFlag } from "@/lib/system-flags-guard";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.nativeEnum(AdminNotificationStatus).optional(),
  severity: z.nativeEnum(AdminNotificationSeverity).optional(),
  type: z.nativeEnum(AdminNotificationType).optional(),
  q: z.string().trim().optional(),
  timeRange: z.enum(["24h", "7d", "30d"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  mineOnly: z.coerce.boolean().optional().default(false),
});

function resolveTimeWindow(input: { timeRange?: "24h" | "7d" | "30d"; from?: string; to?: string }) {
  const now = new Date();
  if (input.from || input.to) {
    return {
      from: input.from ? new Date(input.from) : null,
      to: input.to ? new Date(input.to) : null,
    };
  }
  if (input.timeRange === "24h") return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: null };
  if (input.timeRange === "7d") return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: null };
  if (input.timeRange === "30d") return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: null };
  return { from: null, to: null };
}

export const GET = withErrorHandling(async (req: Request) => {
  const notificationsDisabled = await requireSystemFlag(
    "admin_notifications_enabled",
    "Admin notifications are currently disabled."
  );
  if (notificationsDisabled) return notificationsDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const denied = requirePlatformAdmin(session?.user);
  if (denied) return denied;

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    timeRange: url.searchParams.get("timeRange") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    mineOnly: url.searchParams.get("mineOnly") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const { page, pageSize, status, severity, type, q, mineOnly } = parsed.data;
  const timeWindow = resolveTimeWindow({
    timeRange: parsed.data.timeRange,
    from: parsed.data.from,
    to: parsed.data.to,
  });

  const where = buildAdminNotificationWhere({
    recipientAdminId: session!.user!.id,
    status: status ?? null,
    severity: severity ?? null,
    type: type ?? null,
    q: q ?? null,
    timeFrom: timeWindow.from,
    timeTo: timeWindow.to,
    mineOnly,
  });

  const skip = (page - 1) * pageSize;
  const [total, unreadCount, critical24h, total7d, snoozedCount, items] = await prisma.$transaction([
    prisma.adminNotification.count({ where }),
    prisma.adminNotification.count({
      where: {
        recipientAdminId: session!.user!.id,
        status: "UNREAD",
      },
    }),
    prisma.adminNotification.count({
      where: {
        recipientAdminId: session!.user!.id,
        severity: "CRITICAL",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.adminNotification.count({
      where: {
        recipientAdminId: session!.user!.id,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.adminNotification.count({
      where: {
        recipientAdminId: session!.user!.id,
        status: "SNOOZED",
      },
    }),
    prisma.adminNotification.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }, { createdAt: "desc" }],
      include: {
        recipientAdmin: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
  ]);

  const safeItems = items.map((item) => ({
    ...item,
    metadata: sanitizeAdminNotificationMetadata(item.metadata),
  }));

  return NextResponse.json({
    items: safeItems,
    page,
    pageSize,
    total,
    unreadCount,
    stats: {
      total7d,
      unread: unreadCount,
      critical24h,
      snoozed: snoozedCount,
    },
  });
});
