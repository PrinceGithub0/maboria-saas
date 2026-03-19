import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import { listSupportTicketTimeline } from "@/lib/support/threading";

type Params = { params: { id: string } };

export const GET = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const access = await requireVerifiedPlatformAdminAccess({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (!access.ok) {
    return access.response;
  }

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || "1");
  const pageSize = Number(url.searchParams.get("pageSize") || "20");

  const timeline = await listSupportTicketTimeline({
    ticketId: params.id,
    actorUserId: session.user.id,
    workspaceId: null,
    page,
    pageSize,
  });
  if (!timeline) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json(timeline);
});
