import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import type { SystemLogActor, SystemLogSeverity, SystemLogTab } from "@/lib/admin/system-logs";
import { querySystemLogs } from "@/lib/admin/system-logs";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(50),
  cursor: z.string().trim().max(200).optional(),
  includeTotal: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
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

function runWithTimeout<T>(promise: Promise<T>, timeoutMs = 7000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error("Log query timed out");
      (error as any).status = 504;
      reject(error);
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const denied = requirePlatformAdmin(session.user);
  if (denied) return denied;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    includeTotal: url.searchParams.get("includeTotal") ?? undefined,
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

  const payload = await runWithTimeout(
    querySystemLogs({
      page: values.page,
      pageSize: values.pageSize,
      cursor: values.cursor || null,
      includeTotal: values.includeTotal ?? values.page === 1,
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
    })
  );

  return NextResponse.json(payload);
});
