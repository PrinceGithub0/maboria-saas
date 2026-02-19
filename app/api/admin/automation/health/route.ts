import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import {
  emitAutomationHealthAlerts,
  getAutomationHealthSnapshot,
} from "@/lib/automation/monitoring";

const isAuthorizedRequest = async (req: Request) => {
  const cronSecret = process.env.CRON_SECRET;
  const providedHeader = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const providedBearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (cronSecret && (providedHeader === cronSecret || providedBearer === cronSecret)) {
    return { ok: true as const, source: "cron" as const };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false as const, source: "denied" as const };
  }

  return { ok: true as const, source: "admin" as const };
};

export const GET = withErrorHandling(async (req: Request) => {
  const auth = await isAuthorizedRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snapshot = await getAutomationHealthSnapshot();
  return NextResponse.json({ source: auth.source, ...snapshot });
});

export const POST = withErrorHandling(async (req: Request) => {
  const auth = await isAuthorizedRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snapshot = await getAutomationHealthSnapshot();
  const emitted = await emitAutomationHealthAlerts(snapshot);
  return NextResponse.json({
    source: auth.source,
    generatedAt: snapshot.generatedAt,
    metrics: snapshot.metrics,
    alerts: snapshot.alerts,
    emitted,
  });
});
