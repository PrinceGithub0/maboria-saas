export const TEAM_ACTIVITY_ACTION_TYPES = [
  "INVITE_CREATED",
  "INVITE_ACCEPTED",
  "INVITE_CANCELED",
  "MEMBER_REMOVED",
  "MEMBER_PROMOTED_TO_ADMIN",
  "ADMIN_DEMOTED_TO_MEMBER",
  "MEMBER_PROMOTED_TO_BILLING_ADMIN",
  "BILLING_ADMIN_CHANGED",
  "MEMBER_ROLE_CHANGED",
] as const;

export function buildTeamActivityMessage(entry: {
  actionType: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  targetName?: string | null;
  targetEmail?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const actor = entry.actorName || entry.actorEmail || "Someone";
  const target = entry.targetName || entry.targetEmail || String(entry.metadata?.email || "a teammate");
  const toRoleRaw = typeof entry.metadata?.toRole === "string" ? entry.metadata.toRole : null;
  const toRole =
    toRoleRaw === "billing_admin"
      ? "Billing Admin"
      : toRoleRaw
        ? toRoleRaw.charAt(0).toUpperCase() + toRoleRaw.slice(1)
        : "Member";

  switch (entry.actionType) {
    case "INVITE_CREATED":
      return `${actor} invited ${target}`;
    case "INVITE_ACCEPTED":
      return `${target} joined the workspace`;
    case "INVITE_CANCELED":
      return `${actor} canceled ${target}'s invitation`;
    case "MEMBER_REMOVED":
      return `${actor} removed ${target}`;
    case "MEMBER_PROMOTED_TO_ADMIN":
      return `${actor} changed ${target} role to Admin`;
    case "ADMIN_DEMOTED_TO_MEMBER":
      return `${actor} changed ${target} role to Member`;
    case "MEMBER_PROMOTED_TO_BILLING_ADMIN":
      return `${actor} changed ${target} role to Billing Admin`;
    case "BILLING_ADMIN_CHANGED":
    case "MEMBER_ROLE_CHANGED":
      return `${actor} changed ${target} role to ${toRole}`;
    default:
      return `${actor} updated team access`;
  }
}
