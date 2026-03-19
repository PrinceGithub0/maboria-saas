import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { listAdminTenants } from "@/lib/admin/tenants";
import { getActorSystemFlagRole } from "@/lib/system-flags";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const denied = requirePlatformAdmin(session?.user);
  if (denied) {
    return denied;
  }
  const actorUserId = String(session?.user?.id || "");
  if (!actorUserId) {
    return NextResponse.json({ error: "Insufficient privileges", code: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const response = await listAdminTenants({
    query: url.searchParams.get("query"),
    status: url.searchParams.get("status"),
    plan: url.searchParams.get("plan"),
    page: url.searchParams.get("page"),
    pageSize: url.searchParams.get("pageSize"),
    sort: url.searchParams.get("sort"),
  });

  const actorRole = await getActorSystemFlagRole(actorUserId);
  return NextResponse.json({
    ...response,
    actorRole,
  });
});
