import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { assertRateLimitAsync } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { startSuperAdminStepUp, toHttpError } from "@/lib/admin/users";

const schema = z.object({
  password: z.string().min(1),
});

function getRequestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const ip = getRequestIp(req);
  const userAgent = req.headers.get("user-agent") || "unknown";
  const denied = requirePlatformAdmin(session?.user);
  if (denied) {
    log("warn", "step_up_forbidden", { actorId: session?.user?.id || null, ip });
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }
  const actorUserId = session!.user.id;
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) {
    return impersonationBlocked;
  }

  try {
    await assertRateLimitAsync(`step-up-start:actor:${actorUserId}`, 10, 60_000);
    await assertRateLimitAsync(`step-up-start:ip:${ip}`, 20, 60_000);
  } catch (rateError: any) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly.", code: "RATE_LIMITED", retryAfter: rateError?.retryAfter ?? 60 },
      { status: 429 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Password is required.", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  try {
    const result = await startSuperAdminStepUp({
      actorId: actorUserId,
      password: parsed.data.password,
      ipAddress: ip,
      userAgent,
    });
    return NextResponse.json(result);
  } catch (error) {
    const httpError = toHttpError(error);
    if (httpError.status === 403) {
      log("warn", "step_up_forbidden", {
        actorId: actorUserId,
        ip,
        reason: httpError.message,
        code: httpError.code,
      });
    }
    return NextResponse.json({ error: httpError.message, code: httpError.code }, { status: httpError.status });
  }
});
