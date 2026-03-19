export type ReplyAssignmentDecision =
  | "send_direct"
  | "assign_and_send"
  | "confirm_takeover"
  | "invalid";

export function getReplyAssignmentDecision(input: {
  assignedAdminId: string | null | undefined;
  currentAdminId: string | null | undefined;
}): ReplyAssignmentDecision {
  const currentAdminId = String(input.currentAdminId || "").trim();
  if (!currentAdminId) return "invalid";

  const assignedAdminId = String(input.assignedAdminId || "").trim();
  if (!assignedAdminId) return "assign_and_send";
  if (assignedAdminId === currentAdminId) return "send_direct";
  return "confirm_takeover";
}

