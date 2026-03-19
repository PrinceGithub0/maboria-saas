import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import {
  resolveAuthPlaneContextFromCookie,
  resolveImpersonationFromCookie,
  toImpersonationHttpError,
} from "@/lib/admin/impersonation";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const actorUserId = session?.user?.id;
  if (!actorUserId) {
    return NextResponse.json({ error: "Insufficient privileges", code: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const authContext = await resolveAuthPlaneContextFromCookie({
      actorUserId,
      cookieHeader: req.headers.get("cookie"),
      strictActor: true,
    });
    const active = await resolveImpersonationFromCookie({
      actorUserId,
      cookieHeader: req.headers.get("cookie"),
      strictActor: true,
    });
    return NextResponse.json({
      active: Boolean(active),
      session: active,
      authContext: {
        actorUserId: authContext.actorUserId,
        actorGlobalRole: authContext.actorGlobalRole,
        effectiveUserId: authContext.effectiveUserId,
        effectiveTenantId: authContext.effectiveTenantId,
        effectiveGlobalRole: authContext.effectiveGlobalRole,
        isImpersonating: authContext.isImpersonating,
      },
    });
  } catch (error) {
    const normalized = toImpersonationHttpError(error);
    return NextResponse.json({ error: normalized.message, code: normalized.code }, { status: normalized.status });
  }
});
