import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { AdminNotificationStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { appendAdminNotificationAudit, getAdminUnreadCount, sanitizeAdminNotificationMetadata } from "@/lib/admin/notifications";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { requireSystemFlag } from "@/lib/system-flags-guard";

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
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
    cookieHeader: _req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const { id } = await params;
  const item = await prisma.adminNotification.findFirst({
    where: {
      id,
      recipientAdminId: session!.user!.id,
    },
    include: {
      recipientAdmin: {
        select: { id: true, name: true, email: true },
      },
      acknowledgedByAdmin: {
        select: { id: true, name: true, email: true },
      },
      resolvedByAdmin: {
        select: { id: true, name: true, email: true },
      },
      tenant: {
        select: { id: true, name: true },
      },
      audits: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          actorAdmin: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });
  if (!item) {
    return NextResponse.json({ error: "Notification not found", code: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({
    ...item,
    metadata: sanitizeAdminNotificationMetadata(item.metadata),
    audits: item.audits.map((audit) => ({
      ...audit,
      details: sanitizeAdminNotificationMetadata(audit.details),
    })),
  });
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("MARK_READ") }),
  z.object({ action: z.literal("ACK") }),
  z.object({ action: z.literal("RESOLVE") }),
  z.object({ action: z.literal("UNSNOOZE") }),
  z.object({
    action: z.literal("SNOOZE"),
    snoozedUntil: z.string().datetime(),
  }),
]);

function applyAction(input: {
  action: "MARK_READ" | "ACK" | "RESOLVE" | "SNOOZE" | "UNSNOOZE";
  now: Date;
  snoozedUntil?: Date;
  actorUserId: string;
  currentStatus: AdminNotificationStatus;
}) {
  if (input.action === "SNOOZE") {
    return {
      status: "SNOOZED" as const,
      snoozedUntil: input.snoozedUntil || null,
      acknowledgedAt: undefined,
      acknowledgedByAdminId: undefined,
      resolvedAt: undefined,
      resolvedByAdminId: undefined,
    };
  }
  if (input.action === "UNSNOOZE") {
    return {
      status: "READ" as const,
      snoozedUntil: null,
      acknowledgedAt: undefined,
      acknowledgedByAdminId: undefined,
      resolvedAt: undefined,
      resolvedByAdminId: undefined,
    };
  }
  if (input.action === "ACK") {
    return {
      status: "ACKNOWLEDGED" as const,
      acknowledgedAt: input.now,
      acknowledgedByAdminId: input.actorUserId,
      snoozedUntil: null,
      resolvedAt: undefined,
      resolvedByAdminId: undefined,
    };
  }
  if (input.action === "RESOLVE") {
    return {
      status: "RESOLVED" as const,
      resolvedAt: input.now,
      resolvedByAdminId: input.actorUserId,
      snoozedUntil: null,
      acknowledgedAt: undefined,
      acknowledgedByAdminId: undefined,
    };
  }
  return {
    status: input.currentStatus === "UNREAD" ? ("READ" as const) : input.currentStatus,
    snoozedUntil: null,
    acknowledgedAt: undefined,
    acknowledgedByAdminId: undefined,
    resolvedAt: undefined,
    resolvedByAdminId: undefined,
  };
}

export const PATCH = withErrorHandling(async (req: Request, { params }: Params) => {
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

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const { id } = await params;
  const current = await prisma.adminNotification.findFirst({
    where: {
      id,
      recipientAdminId: session!.user!.id,
    },
    select: { id: true, status: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Notification not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const action = parsed.data.action;
  let snoozedUntil: Date | undefined;
  if (action === "SNOOZE") {
    snoozedUntil = new Date(parsed.data.snoozedUntil);
    if (Number.isNaN(snoozedUntil.getTime()) || snoozedUntil <= new Date()) {
      return NextResponse.json({ error: "snoozedUntil must be in the future", code: "VALIDATION_ERROR" }, { status: 422 });
    }
  }

  const now = new Date();
  const patch = applyAction({
    action,
    now,
    snoozedUntil,
    actorUserId: session!.user!.id,
    currentStatus: current.status,
  });

  const updated = await prisma.$transaction(async (tx) => {
    const notification = await tx.adminNotification.update({
      where: { id: current.id },
      data: patch,
    });

    await appendAdminNotificationAudit({
      notificationId: current.id,
      actorAdminId: session!.user!.id,
      action,
      fromStatus: current.status,
      toStatus: notification.status,
      details: action === "SNOOZE" ? { snoozedUntil: snoozedUntil?.toISOString() } : {},
      tx,
    });

    return notification;
  });

  return NextResponse.json({
    item: updated,
    unreadCount: await getAdminUnreadCount(session!.user!.id),
  });
});
