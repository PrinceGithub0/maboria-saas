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
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ADMIN_WEBHOOK_ARCHIVE", metadata: { id: params.id } },
  });
  return NextResponse.json({ archived: true });
});
