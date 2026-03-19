import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import {
  archiveOldAutomationRunLogs,
  getAutomationRetentionOverview,
} from "@/lib/automation/retention";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const denied = requirePlatformAdmin(session?.user);
  if (denied) return denied;
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session!.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const overview = await getAutomationRetentionOverview();
  return NextResponse.json(overview);
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const denied = requirePlatformAdmin(session?.user);
  if (denied) return denied;
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session!.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const limit = Number(body.limit ?? 250);
  const dryRun = Boolean(body.dryRun ?? false);
  const result = await archiveOldAutomationRunLogs({ limit, dryRun });
  return NextResponse.json(result);
});
