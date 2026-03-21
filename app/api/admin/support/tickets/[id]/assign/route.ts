import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import {
  assignSupportTicketForAdmin,
  normalizeSupportVersion,
  toApiSupportPriority,
  toApiSupportStatus,
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
  const assigneeIdRaw = body?.assigneeId;
  const assigneeId =
    assigneeIdRaw === null || assigneeIdRaw === undefined
      ? null
      : String(assigneeIdRaw).trim() || null;
  const expectedVersion = normalizeSupportVersion(body?.version);
  if (expectedVersion === null) {
    return NextResponse.json({ error: "version is required" }, { status: 422 });
  }

  const result = await assignSupportTicketForAdmin({
    ticketId: id,
    actorUserId: session.user.id,
    assigneeId,
    expectedVersion,
    workspaceId: null,
  });

  if (!result.ok) {
    if (result.reason === "NOT_FOUND") {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    if (result.reason === "ASSIGNEE_NOT_FOUND") {
      return NextResponse.json({ error: "Assignee not found" }, { status: 422 });
    }
    return NextResponse.json(
      { error: "Ticket was updated by another admin.", code: "CONFLICT" },
      { status: 409 }
    );
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
