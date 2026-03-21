import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { readStoredSupportAttachment, readSupportAttachmentsFromMetadata } from "@/lib/support-attachments";
import { findSupportTicketForSubscriber, resolveWorkspaceForSubscriber } from "@/lib/support/threading";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

export const runtime = "nodejs";

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, attachmentId: rawAttachmentId } = await params;
  const workspaceId = await resolveWorkspaceForSubscriber(session.user.id);
  if (!workspaceId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ticket = await findSupportTicketForSubscriber(id, session.user.id, workspaceId);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attachmentId = String(rawAttachmentId || "").trim();
  const attachment = ticket.messages
    .flatMap((message) => readSupportAttachmentsFromMetadata(message.attachments))
    .find((entry) => entry.id === attachmentId);

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
