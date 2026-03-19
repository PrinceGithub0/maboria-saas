import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import { bulkAdminUserAction, normalizeIdentityRole, toHttpError } from "@/lib/admin/users";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await requireVerifiedPlatformAdminAccess({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (!access.ok) {
    return access.response;
  }

  const body = await req.json().catch(() => ({}));
  const userIds = Array.isArray((body as { userIds?: unknown[] }).userIds)
    ? ((body as { userIds: unknown[] }).userIds.filter((value): value is string => typeof value === "string"))
    : [];
  const actionValue = String((body as { action?: string }).action || "")
    .trim()
    .toLowerCase();

  if (actionValue !== "disable" && actionValue !== "change_role" && actionValue !== "delete") {
    return NextResponse.json({ error: "Invalid bulk action." }, { status: 422 });
  }
  const action = actionValue as "disable" | "change_role" | "delete";

  const nextRole = normalizeIdentityRole((body as { role?: string }).role);

  try {
    const result = await bulkAdminUserAction({
      actorId: session.user.id,
      userIds,
      action,
      nextRole: nextRole || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    const httpError = toHttpError(error);
    return NextResponse.json({ error: httpError.message }, { status: httpError.status });
  }
});
