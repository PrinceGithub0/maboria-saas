import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import {
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_TTL_SECONDS,
  startImpersonationSession,
  toImpersonationHttpError,
} from "@/lib/admin/impersonation";
import { requireSystemFlag } from "@/lib/system-flags-guard";

const startSchema = z.object({
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  reason: z.string().min(5).max(1000),
  confirmation: z.string().min(1),
});

function getRequestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

export const POST = withErrorHandling(async (req: Request) => {
  const disabled = await requireSystemFlag("impersonation_enabled", "Impersonation is currently disabled.");
  if (disabled) return disabled;

  const session = await getServerSession(authOptions);
  const denied = requirePlatformAdmin(session?.user);
  if (denied) return denied;

  const actorUserId = session?.user?.id;
  if (!actorUserId) {
    return NextResponse.json({ error: "Insufficient privileges", code: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = startSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (parsed.data.confirmation !== "IMPERSONATE") {
    return NextResponse.json({ error: "Confirmation text is invalid.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const started = await startImpersonationSession({
      actorUserId,
      targetUserId: parsed.data.userId,
      tenantId: parsed.data.tenantId,
      reason: parsed.data.reason,
      confirmation: parsed.data.confirmation,
      actorIp: getRequestIp(req),
      actorUserAgent: req.headers.get("user-agent") || "unknown",
    });

    const response = NextResponse.json({ success: true, ...started, redirectTo: "/dashboard" });
    response.cookies.set(IMPERSONATION_COOKIE_NAME, started.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: IMPERSONATION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    const normalized = toImpersonationHttpError(error);
    return NextResponse.json({ error: normalized.message, code: normalized.code }, { status: normalized.status });
  }
});
