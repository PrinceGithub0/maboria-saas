import { Prisma, UnifiedConversationStatus } from "@prisma/client";

export const UNIFIED_CONVERSATION_STATUS_VALUES: UnifiedConversationStatus[] = [
  "OPEN",
  "WAITING_ON_CUSTOMER",
  "SNOOZED",
  "RESOLVED",
];

export const ACTIVE_UNIFIED_CONVERSATION_STATUSES: UnifiedConversationStatus[] = [
  "OPEN",
  "WAITING_ON_CUSTOMER",
  "SNOOZED",
];

export function isUnifiedConversationStatus(value: string): value is UnifiedConversationStatus {
  return UNIFIED_CONVERSATION_STATUS_VALUES.includes(value as UnifiedConversationStatus);
}

export function buildInboundConversationUpdate(at: Date): Prisma.UnifiedConversationUncheckedUpdateInput {
  return {
    status: "OPEN",
    snoozedUntil: null,
    waitingSince: null,
    lastInboundAt: at,
    lastCustomerReplyAt: at,
    lastMessageAt: at,
    resolvedAt: null,
  };
}

export function buildOutboundConversationUpdate(at: Date): Prisma.UnifiedConversationUncheckedUpdateInput {
  return {
    status: "WAITING_ON_CUSTOMER",
    snoozedUntil: null,
    waitingSince: at,
    lastOutboundAt: at,
    lastMessageAt: at,
    resolvedAt: null,
  };
}

export function buildManualConversationUpdate(input: {
  nextStatus: UnifiedConversationStatus;
  at?: Date;
  snoozedUntil?: Date | null;
}): Prisma.UnifiedConversationUncheckedUpdateInput {
  const at = input.at ?? new Date();

  if (input.nextStatus === "SNOOZED") {
    return {
      status: "SNOOZED",
      snoozedUntil: input.snoozedUntil ?? at,
      waitingSince: null,
      resolvedAt: null,
    };
  }

  if (input.nextStatus === "WAITING_ON_CUSTOMER") {
    return {
      status: "WAITING_ON_CUSTOMER",
      snoozedUntil: null,
      waitingSince: at,
      resolvedAt: null,
    };
  }

  if (input.nextStatus === "RESOLVED") {
    return {
      status: "RESOLVED",
      snoozedUntil: null,
      waitingSince: null,
      resolvedAt: at,
    };
  }

  return {
    status: "OPEN",
    snoozedUntil: null,
    waitingSince: null,
    resolvedAt: null,
  };
}

export function getEffectiveUnifiedConversationStatus(input: {
  status: UnifiedConversationStatus;
  snoozedUntil?: Date | string | null;
  now?: Date;
}): UnifiedConversationStatus {
  if (input.status !== "SNOOZED") return input.status;
  const now = input.now ?? new Date();
  const snoozedUntil =
    input.snoozedUntil instanceof Date
      ? input.snoozedUntil
      : input.snoozedUntil
        ? new Date(input.snoozedUntil)
        : null;

  if (!snoozedUntil || Number.isNaN(snoozedUntil.getTime()) || snoozedUntil <= now) {
    return "OPEN";
  }
  return "SNOOZED";
}
