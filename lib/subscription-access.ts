export type SubscriptionStatus =
  | "INCOMPLETE"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "INACTIVE"
  | "REVOKED";

export function normalizeSubscriptionStatus(status?: string | null): SubscriptionStatus {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") return "ACTIVE";
  if (normalized === "PAST_DUE") return "PAST_DUE";
  if (normalized === "CANCELED") return "CANCELED";
  if (normalized === "INACTIVE") return "INACTIVE";
  if (normalized === "REVOKED") return "REVOKED";
  return "INCOMPLETE";
}

export function isSubscriptionActive(status?: string | null) {
  return normalizeSubscriptionStatus(status) === "ACTIVE";
}

export function getSubscriptionGate(status?: string | null) {
  const normalized = normalizeSubscriptionStatus(status);
  return {
    status: normalized,
    active: normalized === "ACTIVE",
    locked: normalized !== "ACTIVE",
  };
}
