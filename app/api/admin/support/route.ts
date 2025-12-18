import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tickets = await prisma.supportTicket.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true, name: true } } },
  });

  return NextResponse.json(tickets);
});

export const PUT = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, status } = await req.json();
  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: { status },
  });
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "SUPPORT_STATUS", metadata: { id, status } },
  });
  return NextResponse.json(ticket);
});
