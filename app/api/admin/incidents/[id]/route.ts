import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { isSuperAdminActor } from "@/lib/admin/notifications";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { requireSystemFlag } from "@/lib/system-flags-guard";

type Params = { params: Promise<{ id: string }> };

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

  const { id } = await params;
  const existing = await prisma.adminIncident.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Incident not found", code: "NOT_FOUND" }, { status: 404 });
  }

  if (existing.status === "RESOLVED") {
    return NextResponse.json({ incident: existing });
  }

  const incident = await prisma.adminIncident.update({
    where: { id: existing.id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
    },
  });

  return NextResponse.json({ incident });
});
