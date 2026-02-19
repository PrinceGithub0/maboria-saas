import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import {
  archiveOldAutomationRunLogs,
  getAutomationRetentionOverview,
} from "@/lib/automation/retention";

const isAuthorizedRequest = async (req: Request) => {
  const cronSecret = process.env.CRON_SECRET;
  const providedHeader = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const providedBearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (cronSecret && (providedHeader === cronSecret || providedBearer === cronSecret)) {
    return { ok: true as const, source: "cron" as const, userId: null as string | null };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false as const, source: "denied" as const, userId: null as string | null };
  }
  return { ok: true as const, source: "admin" as const, userId: session.user.id };
};

export const GET = withErrorHandling(async (req: Request) => {
  const auth = await isAuthorizedRequest(req);
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const overview = await getAutomationRetentionOverview();
  return NextResponse.json({ source: auth.source, ...overview });
});

export const POST = withErrorHandling(async (req: Request) => {
  const auth = await isAuthorizedRequest(req);
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const rawLimit = Number((body as any)?.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(2000, Math.floor(rawLimit)) : 250;
  const dryRun = Boolean((body as any)?.dryRun ?? false);
  const result = await archiveOldAutomationRunLogs({ limit, dryRun });

  await prisma.activityLog.create({
    data: {
      userId: auth.userId,
      action: "AUTOMATION_RETENTION_RUN",
      metadata: {
        source: auth.source,
        dryRun,
        limit,
        result,
      },
    },
  });

  return NextResponse.json({ ok: true, source: auth.source, ...result });
});

export const dynamic = "force-dynamic";
