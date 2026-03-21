import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import { getAdminUserDetail, toHttpError, updateAdminUserStatus } from "@/lib/admin/users";

export const POST = withErrorHandling(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
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

  const { id } = await params;
  try {
    const detail = await getAdminUserDetail(id);
    const nextStatus = detail.user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    const updated = await updateAdminUserStatus({
      actorId: session.user.id,
      userId: id,
      nextStatus,
    });
    return NextResponse.json({ success: true, user: updated.user, status: updated.user.status });
  } catch (error) {
    const httpError = toHttpError(error);
    return NextResponse.json({ error: httpError.message }, { status: httpError.status });
  }
});
