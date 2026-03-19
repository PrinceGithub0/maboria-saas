import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";

export const POST = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }, { status: 401 });
  const denied = requirePlatformAdmin(session.user);
  if (denied) return denied;
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: _req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const record = await prisma.webhookEvent.findUnique({ where: { id: params.id } });
  if (!record) {
    return NextResponse.json({ error: "Webhook event not found" }, { status: 404 });
  }
  const updated = await prisma.webhookEvent.update({
    where: { id: params.id },
    data: { status: "RESOLVED", processedAt: new Date() },
  });
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ADMIN_WEBHOOK_RESOLVE", metadata: { id: params.id } },
  });
  return NextResponse.json({ status: updated.status, id: updated.id });
});
