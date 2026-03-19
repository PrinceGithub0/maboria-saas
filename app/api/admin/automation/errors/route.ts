import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import {
  AutomationErrorsRange,
  AutomationErrorsSort,
  AutomationRecoveryStatus,
  queryAutomationErrors,
} from "@/lib/admin/automation-errors";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  flowId: z.string().trim().max(120).optional(),
  subscriber: z.string().trim().max(200).optional(),
  tenant: z.string().trim().max(200).optional(),
  status: z.enum(["FAILED", "RETRYING", "RESOLVED"]).optional(),
  range: z.enum(["1h", "24h", "7d", "custom"]).default("24h"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().max(200).optional(),
  sort: z.enum(["created_desc", "created_asc"]).default("created_desc"),
});

export const GET = withErrorHandling(async (req: Request) => {
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

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    flowId: url.searchParams.get("flowId") ?? undefined,
    subscriber: url.searchParams.get("subscriber") ?? undefined,
    tenant: url.searchParams.get("tenant") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    range: url.searchParams.get("range") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const values = parsed.data;
  if (values.range === "custom" && values.from && values.to) {
    const from = new Date(values.from);
    const to = new Date(values.to);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from.getTime() > to.getTime()) {
      return NextResponse.json(
        { error: "from must be before to", code: "VALIDATION_ERROR" },
        { status: 422 }
      );
    }
  }
  const payload = await queryAutomationErrors({
    q: values.q || null,
    flowId: values.flowId || null,
    subscriber: values.subscriber || null,
    tenant: values.tenant || null,
    status: (values.status || null) as AutomationRecoveryStatus | null,
    range: values.range as AutomationErrorsRange,
    from: values.from ? new Date(values.from) : null,
    to: values.to ? new Date(values.to) : null,
    pageSize: values.pageSize,
    cursor: values.cursor || null,
    sort: values.sort as AutomationErrorsSort,
  });

  return NextResponse.json(payload);
});
