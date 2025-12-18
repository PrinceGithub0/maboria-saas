import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runs = await prisma.automationRun.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { flow: true },
  });

  return NextResponse.json(runs);
}
