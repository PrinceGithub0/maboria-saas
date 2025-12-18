import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { getUserPlan, isPlanAtLeast } from "@/lib/entitlements";

export const POST = withErrorHandling(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const plan = await getUserPlan(session.user.id);
  if (!isPlanAtLeast(plan, "enterprise")) {
    return NextResponse.json(
      { error: "Upgrade required", requiredPlan: "enterprise", plan },
      { status: 402 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ADMIN_IMPERSONATE", metadata: { target: user.id } },
  });
  return NextResponse.json({ impersonateUserId: user.id });
});
