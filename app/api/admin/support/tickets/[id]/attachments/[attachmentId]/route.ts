import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireVerifiedPlatformAdminAccess } from "@/lib/admin/admin-rbac";
import { readStoredSupportAttachment, readSupportAttachmentsFromMetadata } from "@/lib/support-attachments";
import { getSupportTicketForAdmin } from "@/lib/support/threading";

type Params = { params: { id: string; attachmentId: string } };

export const runtime = "nodejs";

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

  const ticket = await getSupportTicketForAdmin(params.id, null, session.user.id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const attachmentId = String(params.attachmentId || "").trim();
  const attachment = [
    ...ticket.messages.flatMap((message) => readSupportAttachmentsFromMetadata(message.attachments)),
    ...ticket.notes.flatMap((note) => readSupportAttachmentsFromMetadata(note.attachments)),
  ].find((entry) => entry.id === attachmentId);

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const buffer = await readStoredSupportAttachment(attachment);
  const safeName = String(attachment.filename || "attachment").replace(/["\r\n]/g, "_");

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
});
