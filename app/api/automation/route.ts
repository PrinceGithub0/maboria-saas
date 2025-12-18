import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { automationFlowSchema } from "@/lib/validators";
import { withErrorHandling } from "@/lib/api-handler";
import { assertRateLimit } from "@/lib/rate-limit";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const flows = await prisma.automationFlow.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(flows);
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = automationFlowSchema.parse(body);
  assertRateLimit(`automation:${session.user.id}`);
  const flow = await prisma.automationFlow.create({
    data: {
      userId: session.user.id,
      title: parsed.title,
      description: parsed.description,
      steps: parsed.steps as any,
      status: parsed.status as any,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "AUTOMATION_CREATED",
      metadata: { flowId: flow.id },
    },
  });

  return NextResponse.json(flow, { status: 201 });
});
