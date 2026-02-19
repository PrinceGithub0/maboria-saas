import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceEntitlement } from "@/lib/entitlements";
import { sanitizeAutomationPayload } from "@/lib/automation/redaction";

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
    const output = sanitizeAutomationPayload((run.output as any) || null) as any;
    const resumeState = output?.resumeState || null;
    return {
      ...run,
      logs: sanitizeAutomationPayload(run.logs),
      output,
      trigger: output?.trigger ?? null,
      source: output?.source ?? null,
      input: output?.input ?? null,
      flowVersion: output?.flowSnapshot?.version ?? null,
      flowCapturedAt: output?.flowSnapshot?.capturedAt ?? null,
      nextRunAt: resumeState?.nextRunAt ?? null,
      nextStepIndex:
        typeof resumeState?.nextStepIndex === "number" ? resumeState.nextStepIndex : null,
      lastCompletedStepIndex:
        typeof resumeState?.lastCompletedStepIndex === "number"
          ? resumeState.lastCompletedStepIndex
          : null,
    };
  });

  return NextResponse.json(enriched);
}
