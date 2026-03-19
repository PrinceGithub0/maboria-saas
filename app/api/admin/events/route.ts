import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import { queryEventsExplorer } from "@/lib/admin/events-explorer";
import { getActorSystemFlagRole } from "@/lib/system-flags";
import { assertRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  source: z.enum(["BILLING", "AUTH", "AUTOMATION", "INBOX", "SUPPORT", "SYSTEM"]).optional(),
  eventType: z.string().trim().max(120).optional(),
  tenantId: z.string().trim().max(120).optional(),
  userId: z.string().trim().max(120).optional(),
  entityId: z.string().trim().max(160).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function runWithTimeout<T>(promise: Promise<T>, timeoutMs = 7000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error("Events query timed out");
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

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  assertRateLimit(`admin:events:${session.user.id}`, 60, 60_000);

  const role = await getActorSystemFlagRole(session.user.id);
  if (role !== "SUPER_ADMIN" && role !== "OPS_ADMIN") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
    eventType: url.searchParams.get("eventType") ?? undefined,
    tenantId: url.searchParams.get("tenantId") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const values = parsed.data;
  if (values.tenantId && role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can filter events by tenant directly.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  if (!values.cursor) {
    const hasSearchIntent = Boolean(
      values.q || values.severity || values.source || values.eventType || values.tenantId || values.userId || values.entityId || values.from || values.to
    );
    if (hasSearchIntent) {
      await prisma.activityLog.create({
        data: {
          userId: session.user.id,
          action: "ADMIN_EVENTS_SEARCH",
          metadata: {
            severity: values.severity || null,
            source: values.source || null,
            eventType: values.eventType || null,
            tenantId: values.tenantId || null,
            userId: values.userId || null,
            entityId: values.entityId || null,
            q: values.q || null,
          },
        },
      });
    }
  }

  const payload = await runWithTimeout(
    queryEventsExplorer({
      actorRole: role,
      q: values.q || null,
      severity: values.severity || null,
      source: values.source || null,
      eventType: values.eventType || null,
      tenantId: values.tenantId || null,
      userId: values.userId || null,
      entityId: values.entityId || null,
      from: values.from ? new Date(values.from) : null,
      to: values.to ? new Date(values.to) : null,
      cursor: values.cursor || null,
      limit: values.limit,
    })
  );

  return NextResponse.json({
    actorRole: role,
    ...payload,
  });
});
