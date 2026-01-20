import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

export const POST = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const record = await prisma.webhookEvent.findUnique({ where: { id: params.id } });
  if (!record) {
    return NextResponse.json({ error: "Webhook event not found" }, { status: 404 });
  }
  const updated = await prisma.webhookEvent.update({
    where: { id: params.id },
    data: { status: "ARCHIVED", processedAt: new Date() },
  });
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ADMIN_WEBHOOK_ARCHIVE", metadata: { id: params.id } },
  });
  return NextResponse.json({ status: updated.status, id: updated.id });
});
