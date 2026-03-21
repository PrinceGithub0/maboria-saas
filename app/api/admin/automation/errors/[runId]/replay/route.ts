import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { replayAutomationErrorRun } from "@/lib/admin/automation-errors";
import { assertRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { requireSystemFlag } from "@/lib/system-flags-guard";

const bodySchema = z
  .object({
    reason: z.string().trim().max(280).optional(),
  })
  .optional();

export const POST = withErrorHandling(async (req: Request, ctx?: { params?: Promise<{ runId?: string }> }) => {
  const replayDisabled = await requireSystemFlag(
    "automation_replay_enabled",
    "Automation replay is currently disabled."
  );
  if (replayDisabled) return replayDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const denied = requirePlatformAdmin(session.user);
  if (denied) return denied;

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const resolvedParams = ctx?.params ? await ctx.params : null;
  const runId = String(resolvedParams?.runId || "").trim();
  if (!runId) {
    return NextResponse.json({ error: "Run id is required", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  assertRateLimit(`admin:automation-errors:replay:${session.user.id}`, 10, 60_000);
  assertRateLimit("admin:automation-errors:replay:global", 60, 60_000);
  assertRateLimit(`admin:automation-errors:replay-run:${session.user.id}:${runId}`, 10, 60_000);
  const payload = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid replay request", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() : null;
  const response = await replayAutomationErrorRun({
    runId,
    adminId: session.user.id,
    reason: parsed.data?.reason || null,
    ip: ip || null,
    userAgent: req.headers.get("user-agent") || null,
    requestId: req.headers.get("x-request-id") || null,
  });

  if (!response.ok) {
    return NextResponse.json({ error: response.error, code: response.code }, { status: response.status });
  }

  return NextResponse.json(response, { status: response.httpStatus ?? 200 });
});
