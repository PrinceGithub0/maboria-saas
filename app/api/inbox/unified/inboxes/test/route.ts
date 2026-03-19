import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { sendOutboundEmail, sendOutboundWhatsApp } from "@/lib/inbox/channels";
import { requireUnifiedInboxAccess, writeUnifiedAuditEvent } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);

  const body = await req.json().catch(() => ({}));
  const inboxId = String(body?.inboxId || "").trim();
  const target = String(body?.target || "").trim();
  if (!inboxId || !target) return NextResponse.json({ error: "inboxId and target are required." }, { status: 422 });

  const inbox = await prisma.unifiedInbox.findFirst({
    where: {
      id: inboxId,
      tenantId: context.orgId,
    },
  });
  if (!inbox) return NextResponse.json({ error: "Inbox not found." }, { status: 404 });

  const result =
    inbox.type === "EMAIL"
      ? await sendOutboundEmail({
          inbox,
          conversationId: "health-check",
          toEmail: target,
          subject: "Maboria inbox test",
          html: "<p>This is a channel health test from Maboria Unified Inbox.</p>",
        })
      : await sendOutboundWhatsApp({
          inbox,
          toPhone: target,
          content: "Maboria Unified Inbox test message.",
        });

  await writeUnifiedAuditEvent(prisma, {
    tenantId: context.orgId,
    actorUserId: session.user.id,
    actionType: result.deliveryStatus === "SENT" ? "inbox.health_check_passed" : "inbox.health_check_failed",
    metadata: {
      inboxId: inbox.id,
      inboxType: inbox.type,
      target,
      externalId: result.externalId,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    },
  });

  if (result.deliveryStatus !== "SENT") {
    return NextResponse.json(
      {
        ok: false,
        error: result.errorMessage || "Health check failed.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Health check sent.",
    externalId: result.externalId,
  });
});
