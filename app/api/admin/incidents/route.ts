import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { createAdminNotificationFromEvent, isSuperAdminActor } from "@/lib/admin/notifications";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { requireSystemFlag } from "@/lib/system-flags-guard";

const createIncidentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(3).max(3000),
});

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

  const actorId = session!.user!.id;
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: actorId,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const allowed = await isSuperAdminActor(actorId);
  if (!allowed) {
    return NextResponse.json({ error: "Insufficient privileges", code: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = createIncidentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const payload = parsed.data;
  const now = new Date();
  const incident = await prisma.adminIncident.create({
    data: {
      title: payload.title,
      summary: payload.summary,
      severity: "CRITICAL",
      status: "ACTIVE",
      startedAt: now,
      createdByAdminId: actorId,
    },
  });

  await createAdminNotificationFromEvent({
    eventType: "SYSTEM_OUTAGE",
    entityId: incident.id,
    payload: {
      title: incident.title,
      summary: incident.summary,
      incidentId: incident.id,
      createdByAdminId: actorId,
    },
    occurredAt: now,
  });

  return NextResponse.json({ incident }, { status: 201 });
});
