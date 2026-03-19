import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { assertRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import { resendPlatformUserSetupEmail, toHttpError } from "@/lib/admin/users";

type Params = { params: { id: string } };

function getRequestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

export const POST = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  const ip = getRequestIp(req);
  const userAgent = req.headers.get("user-agent") || "unknown";
  if (!session?.user?.id) {
    log("warn", "identity_resend_setup_forbidden", { actorId: session?.user?.id || null, ip });
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }
  const access = await requireVerifiedPlatformAdminAccess({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (!access.ok) {
    return access.response;
  }

  try {
    assertRateLimit(`identity-resend-setup:actor:${session.user.id}`, 30, 60_000);
    assertRateLimit(`identity-resend-setup:ip:${ip}`, 50, 60_000);
  } catch (rateError: any) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly.", code: "RATE_LIMITED", retryAfter: rateError?.retryAfter ?? 60 },
      { status: 429 }
    );
  }

  try {
    const result = await resendPlatformUserSetupEmail({
      actorId: session.user.id,
      userId: params.id,
      ipAddress: ip,
      userAgent,
    });
    return NextResponse.json(result);
  } catch (error) {
    const httpError = toHttpError(error);
    if (httpError.status === 403) {
      log("warn", "identity_resend_setup_forbidden", {
        actorId: session.user.id,
        ip,
        targetUserId: params.id,
        reason: httpError.message,
      });
    }
    return NextResponse.json({ error: httpError.message, code: httpError.code }, { status: httpError.status });
  }
});
