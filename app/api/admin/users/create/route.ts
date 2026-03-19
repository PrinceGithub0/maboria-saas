import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { log } from "@/lib/logger";
import { assertRateLimit } from "@/lib/rate-limit";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import {
  checkIdentityEmailExists,
  createPlatformUser,
  getIdentityCreateMetadata,
  toHttpError,
} from "@/lib/admin/users";

const createUserSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  role: z.enum(["USER", "OPS_ADMIN", "SUPER_ADMIN"]),
  status: z.enum(["ACTIVE", "PENDING", "DISABLED", "SUSPENDED"]).default("PENDING"),
  sendSetupEmail: z.boolean().default(true),
  tenantId: z.string().min(1).optional().nullable(),
  tenantRole: z
    .enum(["OWNER", "ADMIN", "MEMBER", "BILLING_ADMIN", "owner", "admin", "member", "billing_admin"])
    .optional()
    .nullable(),
  confirmSuperAdminGrant: z.boolean().optional(),
  stepUpToken: z.string().min(16).optional().nullable(),
  targetUserId: z.string().min(1).optional().nullable(),
});

function getRequestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const ip = getRequestIp(req);
  if (!session?.user?.id) {
    log("warn", "identity_create_forbidden", { actorId: session?.user?.id || null, ip, method: "GET" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await requireVerifiedPlatformAdminAccess({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (!access.ok) {
    return access.response;
  }

  const url = new URL(req.url);
  const email = url.searchParams.get("email");

  try {
    if (email) {
      const result = await checkIdentityEmailExists(session.user.id, email);
      return NextResponse.json(result);
    }
    const metadata = await getIdentityCreateMetadata(session.user.id);
    return NextResponse.json(metadata);
  } catch (error) {
    const httpError = toHttpError(error);
    if (httpError.status === 403) {
      log("warn", "identity_create_forbidden", { actorId: session.user.id, ip, method: "GET", reason: httpError.message });
    }
    return NextResponse.json({ error: httpError.message, code: httpError.code }, { status: httpError.status });
  }
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const ip = getRequestIp(req);
  const userAgent = req.headers.get("user-agent") || "unknown";

  if (!session?.user?.id) {
    log("warn", "identity_create_forbidden", { actorId: session?.user?.id || null, ip, method: "POST" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await requireVerifiedPlatformAdminAccess({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (!access.ok) {
    return access.response;
  }

  try {
    assertRateLimit(`identity-create:actor:${session.user.id}`, 20, 60_000);
    assertRateLimit(`identity-create:ip:${ip}`, 40, 60_000);
  } catch (rateError: any) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly.", retryAfter: rateError?.retryAfter ?? 60 },
      { status: 429 }
    );
  }

  const parsed = createUserSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid payload.", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  if (parsed.data.targetUserId && parsed.data.targetUserId === session.user.id) {
    return NextResponse.json(
      { error: "You cannot target your own account in create flow.", code: "FORBIDDEN_ROLE_ESCALATION" },
      { status: 403 }
    );
  }

  try {
    const result = await createPlatformUser({
      actorId: session.user.id,
      payload: parsed.data,
      ipAddress: ip,
      userAgent,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const httpError = toHttpError(error);
    if (httpError.status === 403) {
      log("warn", "identity_create_forbidden", { actorId: session.user.id, ip, method: "POST", reason: httpError.message });
    }
    return NextResponse.json({ error: httpError.message, code: httpError.code }, { status: httpError.status });
  }
});
