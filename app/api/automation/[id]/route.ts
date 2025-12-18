import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { automationFlowSchema } from "@/lib/validators";
import { withErrorHandling } from "@/lib/api-handler";

type Params = { params: { id: string } };

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const flow = await prisma.automationFlow.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(flow);
});

export const PUT = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = automationFlowSchema.partial().parse(body);

  const updated = await prisma.automationFlow.update({
    where: { id: params.id, userId: session.user.id },
    data: {
      title: parsed.title ?? undefined,
      description: parsed.description ?? undefined,
      steps: (parsed.steps as any) ?? undefined,
      category: parsed.category ?? undefined,
      aiParams: (parsed.aiParams as any) ?? undefined,
      status: parsed.status as any,
    },
  });
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.automationFlow.delete({
    where: { id: params.id, userId: session.user.id },
  });
  return NextResponse.json({ success: true });
});
