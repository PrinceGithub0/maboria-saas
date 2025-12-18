import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

export const POST = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const disabled = user.role === "DISABLED";
  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { role: disabled ? "USER" : "DISABLED" },
  });
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ADMIN_TOGGLE_USER", metadata: { target: user.id, disabled: !disabled } },
  });
  return NextResponse.json(updated);
});
