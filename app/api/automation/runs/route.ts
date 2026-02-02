import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceEntitlement } from "@/lib/entitlements";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "automations",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Access denied",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const runs = await prisma.automationRun.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { flow: true },
  });

  const enriched = runs.map((run) => {
    const output = run.output as any;
    return {
      ...run,
      trigger: output?.trigger ?? null,
      source: output?.source ?? null,
      input: output?.input ?? null,
    };
  });

  return NextResponse.json(enriched);
}
