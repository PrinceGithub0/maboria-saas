import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import { normalizeIdentityStatus, toHttpError, updateAdminUserStatus } from "@/lib/admin/users";

type Params = { params: { id: string } };

export const PUT = withErrorHandling(async (req: Request, { params }: Params) => {
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
  const nextStatus = normalizeIdentityStatus((body as { status?: string }).status);
  if (!nextStatus) {
    return NextResponse.json({ error: "Invalid status." }, { status: 422 });
  }

  try {
    const detail = await updateAdminUserStatus({
      actorId: session.user.id,
      userId: params.id,
      nextStatus,
    });
    return NextResponse.json({ success: true, user: detail.user });
  } catch (error) {
    const httpError = toHttpError(error);
    return NextResponse.json({ error: httpError.message }, { status: httpError.status });
  }
});
