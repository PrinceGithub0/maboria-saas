export type GlobalRole = "SUPER_ADMIN" | "OPS_ADMIN" | "USER";

export function normalizeGlobalRole(value?: string | null): GlobalRole {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (normalized === "OPS_ADMIN") return "OPS_ADMIN";
  return "USER";
}

export function isPlatformRole(value?: string | null) {
  const role = normalizeGlobalRole(value);
  return role === "SUPER_ADMIN" || role === "OPS_ADMIN";
}

export function isOpsAdminRole(value?: string | null) {
  return normalizeGlobalRole(value) === "OPS_ADMIN";
}

export function shouldRunWorkspaceChecks(value?: string | null) {
  return normalizeGlobalRole(value) === "USER";
}

export type WorkspaceGateOutcome = "bypass" | "onboarding" | "locked" | "allow";

export function evaluateWorkspaceGate(input: {
  globalRole?: string | null;
  hasTenantContext: boolean;
  orgAccessStatus?: string | null;
  subscriptionStatus?: string | null;
}): WorkspaceGateOutcome {
  if (!shouldRunWorkspaceChecks(input.globalRole)) {
    return "bypass";
  }

  if (!input.hasTenantContext) {
    return "onboarding";
  }

  if (String(input.orgAccessStatus || "").toUpperCase() !== "ACTIVE") {
    return "locked";
  }

  if (String(input.subscriptionStatus || "").toUpperCase() !== "ACTIVE") {
    return "locked";
  }

  return "allow";
}
