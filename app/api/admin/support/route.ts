import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import {
  listSupportTicketsForAdminPaged,
  toApiSupportPriority,
  toApiSupportStatus,
  updateSupportTicket,
} from "@/lib/support/threading";

export const GET = withErrorHandling(async (req: Request) => {
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
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const assigned = url.searchParams.get("assignee") || url.searchParams.get("assigned");
  const search = url.searchParams.get("search");
  const sort = url.searchParams.get("sort");
  const page = Number(url.searchParams.get("page") || "1");
  const pageSize = Number(url.searchParams.get("pageSize") || "20");
  const result = await listSupportTicketsForAdminPaged({
    status,
    priority,
    assigned,
    search,
    sort,
    page,
    pageSize,
    adminUserId: session.user.id,
    workspaceId: null,
  });

  return NextResponse.json({
    items: result.items.map((ticket) => ({
      ...ticket,
      status: toApiSupportStatus(ticket.status),
      priority: toApiSupportPriority(ticket.priority),
    })),
    pagination: result.pagination,
  });
});

export const PUT = withErrorHandling(async (req: Request) => {
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
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 422 });

  const updated = await updateSupportTicket({
    ticketId: id,
    actorUserId: session.user.id,
    workspaceId: null,
    status: body?.status,
    priority: body?.priority,
    assignedAdminId:
      body?.assignedAdminId === undefined ? undefined : String(body?.assignedAdminId || "").trim() || null,
  });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
});
