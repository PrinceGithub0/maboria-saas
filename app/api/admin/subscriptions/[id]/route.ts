import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { subscriptionSchema } from "@/lib/validators";

type Params = { params: { id: string } };

export const PUT = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = subscriptionSchema.partial().parse(body);
  const sub = await prisma.subscription.update({
    where: { id: params.id },
    data: parsed,
  });
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ADMIN_SUB_OVERRIDE", metadata: { subId: params.id, parsed } },
  });
  return NextResponse.json(sub);
});
