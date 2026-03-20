import type { Prisma } from "@prisma/client";
import { resolveOrgContext } from "@/lib/org-auth";

export type AutomationScope = {
  actorUserId: string;
  ownerUserId: string;
  businessId: string | null;
  source: "workspace" | "personal";
};

export async function resolveAutomationScope(userId: string): Promise<AutomationScope> {
  const orgContext = await resolveOrgContext(userId);
  if (orgContext) {
    return {
      actorUserId: userId,
      ownerUserId: orgContext.ownerUserId,
      businessId: orgContext.orgId,
      source: "workspace",
    };
  }

  return {
    actorUserId: userId,
    ownerUserId: userId,
    businessId: null,
    source: "personal",
  };
}

export function buildAutomationFlowWhere(
  scope: AutomationScope,
  extra: Prisma.AutomationFlowWhereInput = {}
): Prisma.AutomationFlowWhereInput {
  if (scope.businessId) {
    return {
      businessId: scope.businessId,
      ...extra,
    };
  }

  return {
    businessId: null,
    userId: scope.ownerUserId,
    ...extra,
  };
}

export function buildAutomationRunWhere(
  scope: AutomationScope,
  extra: Prisma.AutomationRunWhereInput = {}
): Prisma.AutomationRunWhereInput {
  if (scope.businessId) {
    return {
      flow: { businessId: scope.businessId },
      ...extra,
    };
  }

  return {
    userId: scope.ownerUserId,
    flow: { businessId: null },
    ...extra,
  };
}
