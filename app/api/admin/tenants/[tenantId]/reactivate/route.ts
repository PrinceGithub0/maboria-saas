import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import { reactivateTenant } from "@/lib/admin/tenants";
import { getActorSystemFlagRole } from "@/lib/system-flags";

type Params = { params: Promise<{ tenantId: string }> };

export const POST = withErrorHandling(async (_req: Request, ctx: Params) => {
  const session = await getServerSession(authOptions);
  const actorAdminUserId = session?.user?.id;
  if (!actorAdminUserId) {
    return NextResponse.json({ error: "Insufficient privileges", code: "FORBIDDEN" }, { status: 403 });
  }
  const actorRole = await getActorSystemFlagRole(actorAdminUserId);
  if (actorRole !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can reactivate tenants.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: actorAdminUserId,
    cookieHeader: _req.headers.get("cookie"),
  });
  if (impersonationBlocked) {
    return impersonationBlocked;
  }

  const { tenantId: rawTenantId } = await ctx.params;
  const tenantId = String(rawTenantId || "").trim();
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant id is required." }, { status: 422 });
  }

  const result = await reactivateTenant({
    tenantId,
    actorAdminUserId,
  });
  if (!result) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }

  return NextResponse.json(result);
});
