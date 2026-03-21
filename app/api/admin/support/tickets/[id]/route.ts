import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import {
  getSupportTicketForAdmin,
  markSupportTicketReadByAdmin,
  toApiSupportPriority,
  toApiSupportStatus,
} from "@/lib/support/threading";

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const access = await requireVerifiedPlatformAdminAccess({
    actorUserId: session.user.id,
    cookieHeader: _req.headers.get("cookie"),
  });
  if (!access.ok) {
    return access.response;
  }
  const { id } = await params;
  const ticket = await getSupportTicketForAdmin(id, null, session.user.id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  await markSupportTicketReadByAdmin({
    ticketId: id,
    actorUserId: session.user.id,
    workspaceId: null,
  });

  const threadEntries = [
    ...ticket.messages.map((message) => ({
      type: "message" as const,
      id: message.id,
      author: {
        id: message.sender?.id || message.senderId || "system",
        name:
          message.senderType === "SUBSCRIBER"
            ? ticket.subscriber.name || ticket.subscriber.email
            : message.sender?.name || message.sender?.email || "Admin",
        roleLabel:
          message.senderType === "SUBSCRIBER"
            ? "Customer"
            : message.senderType === "ADMIN"
              ? "Admin"
              : "System",
      },
      body: message.content,
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      createdAt: message.createdAt.toISOString(),
      deliveryStatus: message.deliveryStatus,
      errorMessage: message.errorMessage,
    })),
    ...ticket.notes.map((note) => ({
      type: "note" as const,
      id: note.id,
      author: {
        id: note.admin?.id || "system",
        name: note.admin?.name || note.admin?.email || "Admin",
        roleLabel: "Admin",
      },
      body: note.content,
      attachments: Array.isArray(note.attachments) ? note.attachments : [],
      createdAt: note.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return NextResponse.json({
    ...ticket,
    status: toApiSupportStatus(ticket.status),
    priority: toApiSupportPriority(ticket.priority),
    adminUnreadCount: 0,
    version: ticket.version,
    threadEntries,
    sla: ticket.slaState
      ? {
          firstResponse: {
            status: ticket.slaState.firstResponseStatus.toLowerCase(),
            dueAt: ticket.slaState.firstResponseDueAt?.toISOString() || null,
            metAt: ticket.slaState.firstResponseMetAt?.toISOString() || null,
            breachedAt: ticket.slaState.firstResponseBreachedAt?.toISOString() || null,
          },
          nextResponse: {
            status: ticket.slaState.nextResponseStatus.toLowerCase(),
            dueAt: ticket.slaState.nextResponseDueAt?.toISOString() || null,
            metAt: ticket.slaState.nextResponseMetAt?.toISOString() || null,
            breachedAt: ticket.slaState.nextResponseBreachedAt?.toISOString() || null,
            baselineCustomerMessageAt:
              ticket.slaState.nextResponseBaselineCustomerMessageAt?.toISOString() || null,
          },
          resolution: {
            status: ticket.slaState.resolutionStatus.toLowerCase(),
            dueAt: ticket.slaState.resolutionDueAt?.toISOString() || null,
            metAt: ticket.slaState.resolutionMetAt?.toISOString() || null,
            breachedAt: ticket.slaState.resolutionBreachedAt?.toISOString() || null,
          },
          totalPausedSeconds: ticket.slaState.totalPausedSeconds,
        }
      : null,
  });
});
