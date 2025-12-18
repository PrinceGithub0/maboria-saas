import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

type Params = { params: { id: string } };

export const PUT = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { status } = await req.json();
  const ticket = await prisma.supportTicket.findUnique({ where: { id: params.id } });
  if (!ticket || ticket.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const updated = await prisma.supportTicket.update({ where: { id: params.id }, data: { status } });
  return NextResponse.json(updated);
});
