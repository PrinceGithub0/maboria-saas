import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { AdminNotificationSeverity, AdminNotificationStatus, AdminNotificationType, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { buildAdminNotificationWhere, getAdminUnreadCount } from "@/lib/admin/notifications";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { requireSystemFlag } from "@/lib/system-flags-guard";

const bodySchema = z.object({
  action: z.enum(["MARK_READ", "ACK", "RESOLVE"]),
  ids: z.array(z.string().min(1)).optional(),
  filter: z
    .object({
      status: z.nativeEnum(AdminNotificationStatus).optional(),
      severity: z.nativeEnum(AdminNotificationSeverity).optional(),
      type: z.nativeEnum(AdminNotificationType).optional(),
      q: z.string().trim().optional(),
      timeRange: z.enum(["24h", "7d", "30d"]).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      mineOnly: z.boolean().optional(),
    })
    .optional(),
});

const BULK_BATCH_SIZE = 250;
const BULK_MAX_TARGETS = 2000;

function toNextStatus(action: "MARK_READ" | "ACK" | "RESOLVE"): AdminNotificationStatus {
  if (action === "ACK") return "ACKNOWLEDGED";
  if (action === "RESOLVE") return "RESOLVED";
  return "READ";
}

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

export const POST = withErrorHandling(async (req: Request) => {
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
    actorUserId: session!.user!.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const payload = parsed.data;
  const timeWindow = resolveTimeWindow({
    timeRange: payload.filter?.timeRange,
    from: payload.filter?.from,
    to: payload.filter?.to,
  });
  const where: Prisma.AdminNotificationWhereInput = payload.ids?.length
    ? {
        recipientAdminId: session!.user!.id,
        id: { in: Array.from(new Set(payload.ids)) },
      }
    : buildAdminNotificationWhere({
        recipientAdminId: session!.user!.id,
        status: payload.filter?.status ?? null,
        severity: payload.filter?.severity ?? null,
        type: payload.filter?.type ?? null,
        q: payload.filter?.q ?? null,
        timeFrom: timeWindow.from,
        timeTo: timeWindow.to,
        mineOnly: payload.filter?.mineOnly ?? false,
      });

  const targetCount = await prisma.adminNotification.count({ where });
  if (targetCount === 0) {
    return NextResponse.json({ updatedCount: 0, unreadCount: await getAdminUnreadCount(session!.user!.id) });
  }
  if (targetCount > BULK_MAX_TARGETS) {
    return NextResponse.json(
      {
        error: `Bulk action limited to ${BULK_MAX_TARGETS} notifications. Narrow your filter or pass explicit ids.`,
        code: "VALIDATION_ERROR",
      },
      { status: 422 }
    );
  }

  const toStatus = toNextStatus(payload.action);
  let updatedCount = 0;
  let lastProcessedId: string | null = null;

  while (true) {
    const batchWhere: Prisma.AdminNotificationWhereInput = lastProcessedId
      ? {
          AND: [where, { id: { gt: lastProcessedId } }],
        }
      : where;

    const targets: Array<{ id: string; status: AdminNotificationStatus }> = await prisma.adminNotification.findMany({
      where: batchWhere,
      orderBy: { id: "asc" },
      take: BULK_BATCH_SIZE,
      select: { id: true, status: true },
    });

    if (!targets.length) break;

    const ids = targets.map((target) => target.id);
    const now = new Date();
    await prisma.$transaction([
      prisma.adminNotification.updateMany({
        where: { id: { in: ids } },
        data: {
          status: toStatus,
          acknowledgedAt: toStatus === "ACKNOWLEDGED" ? now : undefined,
          acknowledgedByAdminId: toStatus === "ACKNOWLEDGED" ? session!.user!.id : undefined,
          resolvedAt: toStatus === "RESOLVED" ? now : undefined,
          resolvedByAdminId: toStatus === "RESOLVED" ? session!.user!.id : undefined,
        },
      }),
      prisma.adminNotificationAudit.createMany({
        data: targets.map((target) => ({
          notificationId: target.id,
          actorAdminId: session!.user!.id,
          action: payload.action,
          fromStatus: target.status,
          toStatus,
          details: {},
          createdAt: now,
        })),
      }),
    ]);

    updatedCount += ids.length;
    lastProcessedId = ids[ids.length - 1];
  }

  return NextResponse.json({
    updatedCount,
    unreadCount: await getAdminUnreadCount(session!.user!.id),
  });
});
