import { prisma } from "@/lib/prisma";

type AutomationAction = "create" | "edit" | "delete" | "pause" | "run" | "refund" | "view";

type AutomationPermissions = {
  role: string;
  source: "platform_admin" | "business_member" | "fallback_owner";
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
  agent: 10,
};

const normalizeRole = (value: unknown) => String(value || "").trim().toLowerCase();

const resolvePermissionsByRole = (role: string, source: AutomationPermissions["source"]): AutomationPermissions => {
  const elevated = role === "owner" || role === "admin" || role === "platform_admin";
  if (elevated) {
    return {
      role,
      source,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canPause: true,
      canRun: true,
      canIssueRefund: true,
    };
  }
  return {
    role: role || "agent",
    source,
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
  if (user?.role === "ADMIN") {
    return resolvePermissionsByRole("platform_admin", "platform_admin");
  }

  const memberships = await prisma.businessMember.findMany({
    where: { userId },
    select: { role: true },
  });
  if (!memberships.length) {
    return resolvePermissionsByRole("owner", "fallback_owner");
  }

  const primaryRole = memberships
    .map((m) => normalizeRole(m.role))
    .sort((a, b) => (ROLE_RANK[b] || 0) - (ROLE_RANK[a] || 0))[0];

  return resolvePermissionsByRole(primaryRole || "agent", "business_member");
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
