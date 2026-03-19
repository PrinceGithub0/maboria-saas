import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";

type Params = { params: { id: string } };

function legacySupportRouteDisabled(id: string) {
  return NextResponse.json(
    {
      error: "Legacy admin support route is disabled. Use /api/admin/support/tickets/:id endpoints.",
      code: "LEGACY_SUPPORT_ROUTE_DISABLED",
      ticketRoute: `/api/admin/support/tickets/${id}`,
    },
    {
      status: 410,
      headers: {
        "X-API-Deprecated": "true",
      },
    }
  );
}

export const GET = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const access = await requireVerifiedPlatformAdminAccess({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (!access.ok) return access.response;

  return legacySupportRouteDisabled(params.id);
});

export const PATCH = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const access = await requireVerifiedPlatformAdminAccess({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (!access.ok) return access.response;

  return legacySupportRouteDisabled(params.id);
});
