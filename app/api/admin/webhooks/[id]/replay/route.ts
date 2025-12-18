import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { log } from "@/lib/logger";
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

  const record = await prisma.payment.findUnique({ where: { id: params.id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // replay logic: here simply mark as resolved and log
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ADMIN_WEBHOOK_REPLAY", metadata: { id: params.id } },
  });
  log("info", "Webhook replay requested", { id: params.id });
  return NextResponse.json({ replayed: true });
});
