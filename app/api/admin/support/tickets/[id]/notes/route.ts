import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import { addSupportInternalNote, normalizeSupportVersion } from "@/lib/support/threading";
import { requireSystemFlag } from "@/lib/system-flags-guard";

type Params = { params: { id: string } };

export const POST = withErrorHandling(async (req: Request, { params }: Params) => {
  const supportDisabled = await requireSystemFlag("support_enabled", "Support is currently disabled.");
  if (supportDisabled) return supportDisabled;

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
  const message = String(body?.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 422 });
  }

  const expectedVersion = normalizeSupportVersion(body?.version);
  if (expectedVersion === null) {
    return NextResponse.json({ error: "version is required" }, { status: 422 });
  }

  const result = await addSupportInternalNote({
    ticketId: params.id,
    adminId: session.user.id,
    content: message,
    attachments: Array.isArray(body?.attachments) ? body.attachments : undefined,
    expectedVersion,
    workspaceId: null,
  });

  if (!result?.ok) {
    if (result?.reason === "NOT_FOUND") {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    if (result?.reason === "ARCHIVED") {
      return NextResponse.json({ error: "Archived tickets cannot receive internal notes." }, { status: 400 });
    }
    if (result?.reason === "CONFLICT") {
      return NextResponse.json({ error: "Ticket was updated by another admin.", code: "CONFLICT" }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to add note." }, { status: 500 });
  }

  return NextResponse.json(
    {
      note: {
        type: "note",
        id: result.note.id,
        author: {
          id: result.note.admin?.id || session.user.id,
          name: result.note.admin?.name || result.note.admin?.email || "Admin",
          roleLabel: "Admin",
        },
        body: result.note.content,
        attachments: Array.isArray(result.note.attachments) ? result.note.attachments : [],
        createdAt: result.note.createdAt.toISOString(),
      },
      ticket: result.ticket,
    },
    { status: 201 }
  );
});
