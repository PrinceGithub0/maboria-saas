import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { assertRateLimit } from "@/lib/rate-limit";
import type { SystemLogActor, SystemLogSeverity, SystemLogTab } from "@/lib/admin/system-logs";
import { querySystemLogs } from "@/lib/admin/system-logs";
import { requireSystemFlag } from "@/lib/system-flags-guard";

const querySchema = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  tab: z.enum(["all", "errors", "security", "webhooks", "billing", "infrastructure"]).default("all"),
  q: z.string().trim().max(200).optional(),
  severity: z.string().trim().max(120).optional(),
  service: z.string().trim().max(200).optional(),
  actor: z.enum(["user", "admin", "system"]).optional(),
  tenant: z.string().trim().max(120).optional(),
  requestId: z.string().trim().max(120).optional(),
  correlationId: z.string().trim().max(120).optional(),
  eventId: z.string().trim().max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function splitList(value?: string | null) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function csvEscape(value: unknown) {
  const stringValue = String(value ?? "");
  if (!/[,"\n]/.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, '""')}"`;
}

export const GET = withErrorHandling(async (req: Request) => {
  const logsDisabled = await requireSystemFlag(
    "system_logs_enabled",
    "System logs export is currently disabled."
  );
  if (logsDisabled) return logsDisabled;
  const exportsDisabled = await requireSystemFlag(
    "exports_enabled",
    "Exports are currently disabled."
  );
  if (exportsDisabled) return exportsDisabled;

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

  assertRateLimit(`admin-logs-export:${session.user.id}`, 10, 60_000);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    format: url.searchParams.get("format") ?? undefined,
    tab: url.searchParams.get("tab") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined,
    service: url.searchParams.get("service") ?? undefined,
    actor: url.searchParams.get("actor") ?? undefined,
    tenant: url.searchParams.get("tenant") ?? undefined,
    requestId: url.searchParams.get("requestId") ?? undefined,
    correlationId: url.searchParams.get("correlationId") ?? undefined,
    eventId: url.searchParams.get("eventId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const values = parsed.data;
  const severity = splitList(values.severity)
    .map((entry) => entry.toUpperCase())
    .filter((entry): entry is SystemLogSeverity => ["INFO", "WARN", "ERROR", "CRITICAL"].includes(entry));
  const service = splitList(values.service).map((entry) => entry.toUpperCase());

  const payload = await querySystemLogs({
    page: 1,
    pageSize: 50,
    exportAll: true,
    tab: values.tab as SystemLogTab,
    q: values.q || null,
    severities: severity,
    services: service,
    actor: (values.actor || null) as SystemLogActor | null,
    tenant: values.tenant || null,
    requestId: values.requestId || null,
    correlationId: values.correlationId || null,
    eventId: values.eventId || null,
    from: values.from ? new Date(values.from) : null,
    to: values.to ? new Date(values.to) : null,
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (values.format === "json") {
    return new NextResponse(JSON.stringify(payload.items, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"system-logs-${stamp}.json\"`,
      },
    });
  }

  const header = [
    "timestamp",
    "severity",
    "service",
    "message",
    "actor",
    "actorId",
    "actorName",
    "tenantId",
    "scope",
    "requestId",
    "correlationId",
    "eventId",
    "ip",
    "userAgent",
    "source",
    "metadata",
  ];
  const rows = payload.items.map((item) =>
    [
      item.timestamp,
      item.severity,
      item.service,
      item.message,
      item.actor,
      item.actorId,
      item.actorName,
      item.tenantId,
      item.scope,
      item.requestId,
      item.correlationId,
      item.eventId,
      item.ip,
      item.userAgent,
      item.source,
      JSON.stringify(item.metadata),
    ]
      .map(csvEscape)
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"system-logs-${stamp}.csv\"`,
    },
  });
});
