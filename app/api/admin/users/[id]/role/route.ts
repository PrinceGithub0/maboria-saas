import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

type Params = { params: { id: string } };

export const PUT = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { role } = await req.json();
  const user = await prisma.user.update({
    where: { id: params.id },
    data: { role },
  });
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ROLE_UPDATED", metadata: { target: user.id, role } },
  });
  return NextResponse.json(user);
});
