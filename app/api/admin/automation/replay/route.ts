import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { replayAutomationErrorRun } from "@/lib/admin/automation-errors";
import { assertRateLimit } from "@/lib/rate-limit";
import { requireSystemFlag } from "@/lib/system-flags-guard";

const bodySchema = z.object({
  runId: z.string().trim().min(1),
  reason: z.string().trim().max(280).optional(),
});

export const POST = withErrorHandling(async (req: Request) => {
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

  const payload = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "runId is required", code: "VALIDATION_ERROR" }, { status: 422 });
  }
  assertRateLimit(`admin:automation-errors:replay:${session.user.id}`, 10, 60_000);
  assertRateLimit("admin:automation-errors:replay:global", 60, 60_000);
  assertRateLimit(`admin:automation-errors:replay-run:${session.user.id}:${parsed.data.runId}`, 10, 60_000);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const replay = await replayAutomationErrorRun({
    runId: parsed.data.runId,
    adminId: session.user.id,
    reason: parsed.data.reason || null,
    ip,
    userAgent: req.headers.get("user-agent") || null,
    requestId: req.headers.get("x-request-id") || null,
  });

  if (!replay.ok) {
    return NextResponse.json({ error: replay.error, code: replay.code }, { status: replay.status });
  }

  return NextResponse.json(replay, { status: replay.httpStatus ?? 200 });
});
