import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { getAutomationErrorDetail } from "@/lib/admin/automation-errors";

export const GET = withErrorHandling(async (req: Request, ctx?: { params?: { runId?: string } }) => {
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

  const runId = String(ctx?.params?.runId || "").trim();
  if (!runId) {
    return NextResponse.json({ error: "Run id is required", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const detail = await getAutomationErrorDetail(runId);
  if (!detail) {
    return NextResponse.json({ error: "Run not found", code: "RUN_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(detail);
});
