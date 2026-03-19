import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { resolveActiveIncident } from "@/lib/admin/notifications";
import { requireSystemFlag } from "@/lib/system-flags-guard";

export const GET = withErrorHandling(async () => {
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

  const activeIncident = await resolveActiveIncident();
  return NextResponse.json({ activeIncident });
});
