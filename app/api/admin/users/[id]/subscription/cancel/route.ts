import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import { cancelAdminUserSubscription, toHttpError } from "@/lib/admin/users";

type Params = { params: { id: string } };

export const POST = withErrorHandling(async (req: Request, { params }: Params) => {
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

  try {
    const result = await cancelAdminUserSubscription({
      actorId: session.user.id,
      userId: params.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    const httpError = toHttpError(error);
    return NextResponse.json({ error: httpError.message }, { status: httpError.status });
  }
});
