import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import { queryAuditExplorer, type AuditExplorerCategory, type AuditExplorerSource } from "@/lib/admin/audit-explorer";
import { getActorSystemFlagRole } from "@/lib/system-flags";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  q: z.string().trim().max(200).optional(),
  category: z.enum(["all", "impersonation", "role", "system_flags", "tenant"]).default("all"),
  source: z.enum(["all", "audit", "system_flag"]).default("all"),
});

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const role = await getActorSystemFlagRole(session.user.id);
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only SUPER_ADMIN can access audit explorer.", code: "FORBIDDEN" }, { status: 403 });
  }

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const payload = await queryAuditExplorer({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    q: parsed.data.q || null,
    category: parsed.data.category as AuditExplorerCategory,
    source: parsed.data.source as AuditExplorerSource,
  });

  return NextResponse.json(payload);
});
