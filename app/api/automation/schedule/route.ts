import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { flowId, runAt } = await req.json();
  const flow = await prisma.automationFlow.findUnique({ where: { id: flowId } });
  if (!flow || flow.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const scheduled = await prisma.automationRun.create({
    data: {
      flowId,
      userId: session.user.id,
      runStatus: "PENDING",
      logs: [],
      createdAt: runAt ? new Date(runAt) : new Date(),
    },
  });

  return NextResponse.json({ scheduled: true, id: scheduled.id });
}
