import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import { resetAdminUserPassword, toHttpError } from "@/lib/admin/users";

export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await getServerSession(authOptions);
  const normalizedRole = String(session?.user?.role || "").toUpperCase();
  if (
    !session?.user?.id ||
    (normalizedRole !== "OPS_ADMIN" && normalizedRole !== "SUPER_ADMIN")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) {
    return impersonationBlocked;
  }

  const body = await req.json().catch(() => ({}));
  const password = String((body as { password?: string }).password || "");

  try {
    await resetAdminUserPassword({
      actorId: session.user.id,
      userId: params.id,
      password,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const httpError = toHttpError(error);
    return NextResponse.json({ error: httpError.message }, { status: httpError.status });
  }
});
