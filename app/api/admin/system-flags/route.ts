import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import {
  ALL_SYSTEM_FLAGS,
  getActorSystemFlagRole,
  listSystemFlagsWithAuditMeta,
  refreshFlags,
  setSystemFlag,
  type SystemFlag,
} from "@/lib/system-flags";

const updateSchema = z.object({
  key: z.enum(ALL_SYSTEM_FLAGS as [SystemFlag, ...SystemFlag[]]),
  value: z.boolean(),
});

function getRequestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0]?.trim() || null : null;
}

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const role = await getActorSystemFlagRole(session.user.id);
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only SUPER_ADMIN can access system flags.", code: "FORBIDDEN" }, { status: 403 });
  }

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const flags = await listSystemFlagsWithAuditMeta();
  return NextResponse.json({ flags, actorRole: role });
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const role = await getActorSystemFlagRole(session.user.id);
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only SUPER_ADMIN can modify system flags.", code: "FORBIDDEN" }, { status: 403 });
  }

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const payload = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid system flag payload.", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const updated = await setSystemFlag({
    key: parsed.data.key,
    value: parsed.data.value,
    actorUserId: session.user.id,
    actorIp: getRequestIp(req),
    actorUserAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    ok: true,
    ...updated,
    actorRole: role,
  });
});

export const PUT = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const role = await getActorSystemFlagRole(session.user.id);
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only SUPER_ADMIN can refresh system flags.", code: "FORBIDDEN" }, { status: 403 });
  }

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const body = await req.json().catch(() => ({}));
  if (body?.action !== "refresh") {
    return NextResponse.json({ error: "Invalid refresh request", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  await refreshFlags({ force: true });
  return NextResponse.json({ ok: true });
});
