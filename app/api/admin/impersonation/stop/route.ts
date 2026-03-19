import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import {
  IMPERSONATION_COOKIE_NAME,
  stopImpersonationSession,
  toImpersonationHttpError,
} from "@/lib/admin/impersonation";

function getRequestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const actorUserId = session?.user?.id;
  if (!actorUserId) {
    return NextResponse.json({ error: "Insufficient privileges", code: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const result = await stopImpersonationSession({
      actorUserId,
      cookieHeader: req.headers.get("cookie"),
      actorIp: getRequestIp(req),
      actorUserAgent: req.headers.get("user-agent") || "unknown",
    });

    const response = NextResponse.json({
      success: true,
      stopped: result.stopped,
    });
    response.cookies.set(IMPERSONATION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    const normalized = toImpersonationHttpError(error);
    return NextResponse.json({ error: normalized.message, code: normalized.code }, { status: normalized.status });
  }
});
