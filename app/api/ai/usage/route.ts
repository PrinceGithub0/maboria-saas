import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiUsageLogSchema } from "@/lib/validators";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "ai",
    requiredPlan: "pro",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: entitlement.reason,
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        plan: entitlement.plan,
      },
      { status: 402 }
    );
  }
  const logs = await prisma.aiUsageLog.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(logs);
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "ai",
    requiredPlan: "pro",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: entitlement.reason,
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        plan: entitlement.plan,
      },
      { status: 402 }
    );
  }
  const parsed = aiUsageLogSchema.parse(await req.json());
  const log = await prisma.aiUsageLog.create({
    data: { userId: session.user.id, ...parsed },
  });
  return NextResponse.json(log, { status: 201 });
});
