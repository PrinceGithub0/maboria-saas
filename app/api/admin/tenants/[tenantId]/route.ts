import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { getAdminTenantDetail } from "@/lib/admin/tenants";
import { getActorSystemFlagRole } from "@/lib/system-flags";

type Params = { params: { tenantId: string } };

export const GET = withErrorHandling(async (_req: Request, ctx: Params) => {
  const session = await getServerSession(authOptions);
  const denied = requirePlatformAdmin(session?.user);
  if (denied) {
    return denied;
  }
  const actorUserId = String(session?.user?.id || "");
  if (!actorUserId) {
    return NextResponse.json({ error: "Insufficient privileges", code: "FORBIDDEN" }, { status: 403 });
  }

  const tenantId = String(ctx?.params?.tenantId || "").trim();
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant id is required." }, { status: 422 });
  }

  const detail = await getAdminTenantDetail(tenantId);
  if (!detail) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }

  const actorRole = await getActorSystemFlagRole(actorUserId);
  return NextResponse.json({
    ...detail,
    actorRole,
  });
});
