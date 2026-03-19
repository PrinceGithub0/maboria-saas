import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceEntitlement } from "@/lib/entitlements";
import { getAutomationPermissions, hasAutomationPermission } from "@/lib/automation/permissions";
import { requiresFinancialAutomationPrivilege } from "@/lib/automation/step-policy";
import { requireSystemFlag } from "@/lib/system-flags-guard";

export async function POST(req: Request) {
  const automationDisabled = await requireSystemFlag(
    "automation_enabled",
    "Automation engine is currently disabled."
  );
  if (automationDisabled) return automationDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const permissions = await getAutomationPermissions(session.user.id);
  if (!hasAutomationPermission(permissions, "run")) {
    return NextResponse.json(
      {
        error: "Forbidden",
        type: "permission_denied",
        action: "schedule_automation",
        role: permissions.role,
        requiredRole: "owner_admin_or_agent",
      },
      { status: 403 }
    );
  }

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

  const { flowId, runAt } = await req.json();
  const flow = await prisma.automationFlow.findUnique({ where: { id: flowId } });
  if (!flow || flow.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (requiresFinancialAutomationPrivilege((flow.steps as any[]) || [])) {
    if (!hasAutomationPermission(permissions, "refund")) {
      return NextResponse.json(
        {
          error: "Forbidden",
          type: "permission_denied",
          action: "schedule_financial_automation",
          role: permissions.role,
          requiredRole: "owner_or_admin",
        },
        { status: 403 }
      );
    }
  }

  const scheduled = await prisma.automationRun.create({
    data: {
      flowId,
      userId: session.user.id,
      runStatus: "PENDING",
      logs: [],
      createdAt: runAt ? new Date(runAt) : new Date(),
      output: {
        trigger: "Schedule",
        source: "Scheduler",
        input: { scheduledFor: runAt ?? null },
      },
    },
  });

  return NextResponse.json({ scheduled: true, id: scheduled.id });
}
