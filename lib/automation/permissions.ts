import { prisma } from "@/lib/prisma";
import { isPlatformRole } from "@/lib/global-role";
import { resolveOrgContext } from "@/lib/org-auth";

type AutomationAction = "create" | "edit" | "delete" | "pause" | "run" | "refund" | "view";

type AutomationPermissions = {
  role: string;
  source: "platform_admin" | "business_member" | "fallback_owner";
  businessId: string | null;
  ownerUserId: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPause: boolean;
  canRun: boolean;
  canIssueRefund: boolean;
};

const ROLE_RANK: Record<string, number> = {
  owner: 30,
  admin: 20,
  member: 10,
  agent: 10,
};

const normalizeRole = (value: unknown) => String(value || "").trim().toLowerCase();

const resolvePermissionsByRole = (
  role: string,
  source: AutomationPermissions["source"],
  ownership: Pick<AutomationPermissions, "businessId" | "ownerUserId">
): AutomationPermissions => {
  const elevated = role === "owner" || role === "admin" || role === "platform_admin";
  if (elevated) {
    return {
      role,
      source,
      businessId: ownership.businessId,
      ownerUserId: ownership.ownerUserId,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canPause: true,
      canRun: true,
      canIssueRefund: true,
    };
  }
  return {
    role: role || "member",
    source,
    businessId: ownership.businessId,
    ownerUserId: ownership.ownerUserId,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canPause: false,
    canRun: true,
    canIssueRefund: false,
  };
};

export async function getAutomationPermissions(userId: string): Promise<AutomationPermissions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (isPlatformRole(user?.role)) {
    return resolvePermissionsByRole("platform_admin", "platform_admin", {
      businessId: null,
      ownerUserId: userId,
    });
  }

  const orgContext = await resolveOrgContext(userId);
  if (orgContext) {
    return resolvePermissionsByRole(normalizeRole(orgContext.role), "business_member", {
      businessId: orgContext.orgId,
      ownerUserId: orgContext.ownerUserId,
    });
  }

  const memberships = await prisma.businessMember.findMany({
    where: { userId, status: "active" },
    select: { role: true },
  });
  if (memberships.length) {
    const primaryRole = memberships
      .map((m) => normalizeRole(m.role))
      .sort((a, b) => (ROLE_RANK[b] || 0) - (ROLE_RANK[a] || 0))[0];
    return resolvePermissionsByRole(primaryRole || "member", "business_member", {
      businessId: null,
      ownerUserId: userId,
    });
  }

  return resolvePermissionsByRole("owner", "fallback_owner", {
    businessId: null,
    ownerUserId: userId,
  });
}

export function hasAutomationPermission(permissions: AutomationPermissions, action: AutomationAction) {
  switch (action) {
    case "view":
      return true;
    case "create":
      return permissions.canCreate;
    case "edit":
      return permissions.canEdit;
    case "delete":
      return permissions.canDelete;
    case "pause":
      return permissions.canPause;
    case "run":
      return permissions.canRun;
    case "refund":
      return permissions.canIssueRefund;
    default:
      return false;
  }
}

export type { AutomationAction, AutomationPermissions };
