import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const POST = withErrorHandling(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { password } = await req.json();
  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: params.id }, data: { passwordHash } });
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ADMIN_RESET_PASSWORD", metadata: { target: params.id } },
  });
  return NextResponse.json({ success: true });
});
