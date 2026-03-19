export const ORG_ROLE_VALUES = ["owner", "admin", "billing_admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLE_VALUES)[number];

export type OrgPermission =
  | "team:read"
  | "team:invite"
  | "team:remove_member"
  | "team:promote_member"
  | "team:demote_admin"
  | "settings:business:read"
  | "settings:business:write"
  | "settings:payout:read"
  | "settings:payout:write"
  | "subscription:manage";

function roleRank(role: OrgRole) {
  if (role === "owner") return 4;
  if (role === "admin") return 3;
  if (role === "billing_admin") return 2;
  return 1;
}

export function normalizeOrgRole(value?: string | null): OrgRole {
  const role = String(value || "").trim().toLowerCase();
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  if (role === "billing_admin") return "billing_admin";
  return "member";
}

export function hasOrgPermission(role: OrgRole, permission: OrgPermission) {
  if (role === "owner") return true;

  const adminAllowed: Set<OrgPermission> = new Set([
    "team:read",
    "team:invite",
    "team:remove_member",
    "team:promote_member",
    "settings:business:read",
    "settings:business:write",
    "settings:payout:read",
    "settings:payout:write",
  ]);

  const billingAdminAllowed: Set<OrgPermission> = new Set([
    "team:read",
    "settings:business:read",
    "settings:payout:read",
    "settings:payout:write",
    "subscription:manage",
  ]);

  const memberAllowed: Set<OrgPermission> = new Set([
    "team:read",
    "settings:business:read",
  ]);

  if (role === "admin") return adminAllowed.has(permission);
  if (role === "billing_admin") return billingAdminAllowed.has(permission);
  return memberAllowed.has(permission);
}

export function canAssignBillingAdmin(actorRole: OrgRole) {
  return actorRole === "owner";
}

export function canManageSubscription(role: OrgRole) {
  return role === "owner" || role === "billing_admin";
}

export function canActorChangeTargetRole(actor: OrgRole, target: OrgRole, nextRole: OrgRole) {
  if (target === "owner" || nextRole === "owner") return false;
  if (actor === "owner") return true;
  if (actor === "admin") {
    return target === "member" && nextRole === "admin";
  }
  return false;
}

export function getHighestRole(roles: Array<string | null | undefined>): OrgRole {
  const normalized = roles.map((value) => normalizeOrgRole(value));
  normalized.sort((a, b) => roleRank(b) - roleRank(a));
  return normalized[0] ?? "member";
}
