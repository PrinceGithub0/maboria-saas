import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import { ALL_SYSTEM_FLAGS, getActorSystemFlagRole, listSystemFlagHistory, type SystemFlag } from "@/lib/system-flags";

const querySchema = z.object({
  take: z.coerce.number().int().min(1).max(200).default(50),
  flagKey: z.enum(ALL_SYSTEM_FLAGS as [SystemFlag, ...SystemFlag[]]).optional(),
});

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const role = await getActorSystemFlagRole(session.user.id);
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only SUPER_ADMIN can view system flag history.", code: "FORBIDDEN" }, { status: 403 });
  }

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    take: url.searchParams.get("take") ?? undefined,
    flagKey: url.searchParams.get("flagKey") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  const history = await listSystemFlagHistory({
    take: parsed.data.take,
    flagKey: parsed.data.flagKey || null,
  });

  return NextResponse.json({ history });
});
