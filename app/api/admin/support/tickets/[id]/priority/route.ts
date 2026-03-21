import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import {
  normalizeSupportVersion,
  toApiSupportPriority,
  toApiSupportStatus,
  updateSupportTicketPriorityForAdmin,
} from "@/lib/support/threading";

type Params = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (req: Request, { params }: Params) => {
  const { id } = await params;
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

  const body = await req.json().catch(() => ({}));
  const priority = String(body?.priority || "").trim().toUpperCase();
  if (!priority) {
    return NextResponse.json({ error: "priority is required" }, { status: 422 });
  }
  const expectedVersion = normalizeSupportVersion(body?.version);
  if (expectedVersion === null) {
    return NextResponse.json({ error: "version is required" }, { status: 422 });
  }

  const result = await updateSupportTicketPriorityForAdmin({
    ticketId: id,
    actorUserId: session.user.id,
    priority,
    expectedVersion,
    workspaceId: null,
  });

  if (!result.ok) {
    if (result.reason === "NOT_FOUND") return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    return NextResponse.json({ error: "Ticket was updated by another admin.", code: "CONFLICT" }, { status: 409 });
  }

  return NextResponse.json({
    ticket: result.ticket
      ? {
          ...result.ticket,
          status: toApiSupportStatus(result.ticket.status),
          priority: toApiSupportPriority(result.ticket.priority),
        }
      : null,
  });
});
