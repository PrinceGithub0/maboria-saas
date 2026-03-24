import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { executeAutomationRun } from "@/lib/automation/engine";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";
import {
  enforceEntitlement,
  enforceUsageLimit,
  getUserPlan,
  isPlanAtLeast,
  nextPlanAfter,
} from "@/lib/entitlements";
import { buildAutomationFlowWhere, resolveAutomationScope } from "@/lib/automation/access";
import { getAutomationPermissions, hasAutomationPermission } from "@/lib/automation/permissions";
import { requiresFinancialAutomationPrivilege } from "@/lib/automation/step-policy";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const permissions = await getAutomationPermissions(session.user.id);
  if (!hasAutomationPermission(permissions, "run")) {
    return NextResponse.json(
      {
        error: "Forbidden",
        type: "permission_denied",
        action: "run_automation",
        role: permissions.role,
        requiredRole: "owner_admin_or_agent",
      },
      { status: 403 }
    );
  }

  const { flowId, input, idempotencyKey } = await req.json();
  if (!flowId || typeof flowId !== "string" || flowId === "undefined" || flowId === "null") {
    return NextResponse.json({ error: "Invalid automation id" }, { status: 400 });
  }
  assertRateLimit(`run:${session.user.id}`);

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

  const usage = await enforceUsageLimit(session.user.id, "automationRuns");
  if (!usage.ok) {
    if (usage.code === "payment_required") {
      return NextResponse.json(
        {
          error: "Payment required",
          type: "payment_required",
          reason: "Active subscription required to run automations",
          plan: usage.plan,
        },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: "limit_reached",
        reason: "Automation run limit reached for this month",
        requiredPlan: nextPlanAfter(usage.plan),
        plan: usage.plan,
        limit: usage.limit,
        used: usage.used,
      },
      { status: 402 }
    );
  }

  const automationScope = await resolveAutomationScope(session.user.id);
  const flow = await prisma.automationFlow.findFirst({
    where: buildAutomationFlowWhere(automationScope, { id: flowId }),
  });
  if (!flow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const plan = await getUserPlan(session.user.id);
  const steps = (flow.steps as any[]) || [];
  if (requiresFinancialAutomationPrivilege(steps)) {
    if (!hasAutomationPermission(permissions, "refund")) {
      return NextResponse.json(
        {
          error: "Forbidden",
          type: "permission_denied",
          action: "run_financial_automation",
          role: permissions.role,
          requiredRole: "owner_or_admin",
        },
        { status: 403 }
      );
    }
  }
  const usesAi = steps.some((s) => s?.type === "aiTransform");
  const usesWhatsApp = steps.some((s) => s?.type === "sendWhatsApp");

  if (usesAi) {
    const aiEntitlement = await enforceEntitlement(session.user.id, {
      feature: "ai",
      requiredPlan: "free",
      allowTrial: false,
    });
    if (!aiEntitlement.ok) {
      return NextResponse.json(
        {
          error: "Upgrade required",
          type: aiEntitlement.type,
          requiredPlan: aiEntitlement.requiredPlan ?? "free",
          plan,
          reason: aiEntitlement.reason,
        },
        { status: 403 }
      );
    }
  }

  if (usesWhatsApp) {
    const whatsappEntitlement = await enforceEntitlement(session.user.id, {
      feature: "whatsapp",
      requiredPlan: "starter",
      allowTrial: false,
    });
    if (!whatsappEntitlement.ok) {
      return NextResponse.json(
        {
          error: "Upgrade required",
          type: whatsappEntitlement.type,
          requiredPlan: whatsappEntitlement.requiredPlan ?? "starter",
          plan,
          reason: "WhatsApp automation is a Starter feature",
        },
        { status: 403 }
      );
    }
  }

  const safeIdempotencyKey =
    typeof idempotencyKey === "string" && idempotencyKey.trim() ? idempotencyKey.trim() : undefined;
  const result = await executeAutomationRun(flow, input || {}, {
    trigger: "Manual",
    source: "Dashboard",
    idempotencyKey: safeIdempotencyKey,
  });
  if (!result) {
    return NextResponse.json({ error: "Run failed" }, { status: 500 });
  }
  if ((result as any).status === "FAILED") {
    if (isPlanAtLeast(plan, "starter")) {
      const aiUsage = await enforceUsageLimit(session.user.id, "aiRequests");
      if (aiUsage.ok) {
        try {
          const diagnosis = await aiRouter({
            mode: "diagnose",
            prompt: "Diagnose automation failure",
            context: { flow, logs: result.logs },
            userId: session.user.id,
          });
          return NextResponse.json({ status: result.status, logs: result.logs, diagnosis });
        } catch {
          return NextResponse.json({ status: result.status, logs: result.logs });
        }
      }
    }
    return NextResponse.json({ status: result.status, logs: result.logs });
  }
  return NextResponse.json({ status: result.status, logs: result.logs });
});
