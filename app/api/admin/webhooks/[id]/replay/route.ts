import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { log } from "@/lib/logger";

export const POST = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const record = await prisma.webhookEvent.findUnique({ where: { id: params.id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updated = await prisma.webhookEvent.update({
    where: { id: params.id },
    data: { status: "REPLAY_REQUESTED", error: null },
  });
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ADMIN_WEBHOOK_REPLAY", metadata: { id: params.id } },
  });
  log("info", "Webhook replay requested", {
    id: params.id,
    provider: updated.provider,
    eventId: updated.eventId,
  });
  return NextResponse.json({ status: updated.status, id: updated.id });
});
