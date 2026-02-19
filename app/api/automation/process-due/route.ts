import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { processDueAutomationRuns } from "@/lib/automation/scheduler";

const isAuthorizedCronRequest = async (req: Request) => {
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

export const POST = withErrorHandling(async (req: Request) => {
  const auth = await isAuthorizedCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rawLimit = Number((body as any)?.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.floor(rawLimit)) : 50;

  const summary = await processDueAutomationRuns({ limit });

  await prisma.activityLog.create({
    data: {
      userId: auth.userId,
      action: "AUTOMATION_PROCESS_DUE",
      metadata: {
        source: auth.source,
        limit,
        summary,
      },
    },
  });

  return NextResponse.json({ ok: true, source: auth.source, ...summary });
});

export const dynamic = "force-dynamic";
