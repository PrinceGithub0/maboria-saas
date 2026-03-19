import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import {
  emitAutomationAuditIntegrityAlerts,
  getAutomationAuditIntegritySnapshot,
} from "@/lib/automation/audit-monitor";
import { isPlatformRole } from "@/lib/global-role";

const isAuthorizedRequest = async (req: Request) => {
  const cronSecret = process.env.CRON_SECRET;
  const providedHeader = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const providedBearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (cronSecret && (providedHeader === cronSecret || providedBearer === cronSecret)) {
    return { ok: true as const, source: "cron" as const };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user || !isPlatformRole(session.user.role)) {
    return { ok: false as const, source: "denied" as const };
  }
  return { ok: true as const, source: "admin" as const };
};

export const GET = withErrorHandling(async (req: Request) => {
  const auth = await isAuthorizedRequest(req);
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || 5000);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(20_000, Math.floor(limitRaw)) : 5000;
  const snapshot = await getAutomationAuditIntegritySnapshot({ limit });
  return NextResponse.json({ source: auth.source, ...snapshot });
});

export const POST = withErrorHandling(async (req: Request) => {
  const auth = await isAuthorizedRequest(req);
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const limitRaw = Number((body as any)?.limit || 5000);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(20_000, Math.floor(limitRaw)) : 5000;
  const snapshot = await getAutomationAuditIntegritySnapshot({ limit });
  const alerts = await emitAutomationAuditIntegrityAlerts(snapshot);

  return NextResponse.json({
    source: auth.source,
    generatedAt: snapshot.generatedAt,
    scanned: snapshot.scanned,
    groups: snapshot.groups,
    invalidFlows: snapshot.invalidFlows,
    invalidEntries: snapshot.invalidEntries,
    alerts,
  });
});

export const dynamic = "force-dynamic";
