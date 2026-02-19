import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import {
  archiveOldAutomationRunLogs,
  getAutomationRetentionOverview,
} from "@/lib/automation/retention";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const overview = await getAutomationRetentionOverview();
  return NextResponse.json(overview);
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
