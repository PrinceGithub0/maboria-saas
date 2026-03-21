import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import { suspendTenant } from "@/lib/admin/tenants";
import { getActorSystemFlagRole } from "@/lib/system-flags";

const suspendSchema = z.object({
  reason: z.string().max(500).optional(),
});

type Params = { params: Promise<{ tenantId: string }> };

export const POST = withErrorHandling(async (req: Request, ctx: Params) => {
  const session = await getServerSession(authOptions);
  const actorAdminUserId = session?.user?.id;
  if (!actorAdminUserId) {
    return NextResponse.json({ error: "Insufficient privileges", code: "FORBIDDEN" }, { status: 403 });
  }
  const actorRole = await getActorSystemFlagRole(actorAdminUserId);
  if (actorRole !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can suspend tenants.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: actorAdminUserId,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) {
    return impersonationBlocked;
  }

  const { tenantId: rawTenantId } = await ctx.params;
  const tenantId = String(rawTenantId || "").trim();
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant id is required." }, { status: 422 });
  }

  const parsed = suspendSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 422 });
  }

  const result = await suspendTenant({
    tenantId,
    actorAdminUserId,
    reason: parsed.data.reason,
  });
  if (!result) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }

  return NextResponse.json(result);
});
