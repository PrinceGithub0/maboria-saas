import "server-only";

import { prisma } from "./prisma";

export type AnalyticsEventType =
  | "AI_REQUEST"
  | "AI_TOKENS"
  | "INVOICE_SENT"
  | "AUTOMATION_RUN"
  | "WHATSAPP_MESSAGE"
  | "WHATSAPP_MESSAGE_SENT";

type RecordAnalyticsParams = {
  userId: string;
  workspaceId?: string | null;
  orgId?: string | null;
  type: AnalyticsEventType;
  count?: number;
  tokenCount?: number;
  createdAt?: Date;
  source?: string;
};

function toUtcDay(value: Date) {
  const day = new Date(value);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

export async function recordAnalyticsEvent({
  userId,
  workspaceId,
  orgId,
  type,
  count = 1,
  tokenCount,
  createdAt,
  source = "system",
}: RecordAnalyticsParams) {
  const timestamp = createdAt ?? new Date();
  const day = toUtcDay(timestamp);
  const resolvedWorkspaceId = workspaceId ?? orgId ?? userId;
  const resolvedType = type === "WHATSAPP_MESSAGE" ? "WHATSAPP_MESSAGE_SENT" : type;
  const existing = await prisma.analyticsEvent.findFirst({
    where: {
      workspaceId: resolvedWorkspaceId,
      type: resolvedType,
      day,
      source,
    },
    select: { id: true, count: true, tokenCount: true },
  });

  const incrementCount = Number.isFinite(count) ? Number(count) : 0;
  const incrementTokens =
    typeof tokenCount === "number" ? tokenCount : resolvedType === "AI_TOKENS" ? incrementCount : 0;

  if (existing) {
    await prisma.analyticsEvent.update({
      where: { id: existing.id },
      data: {
        count: (existing.count ?? 0) + incrementCount,
        tokenCount:
          typeof existing.tokenCount === "number"
            ? existing.tokenCount + incrementTokens
            : incrementTokens || null,
        createdAt: timestamp,
      },
    });
    return;
  }

  await prisma.analyticsEvent.create({
    data: {
      userId,
      workspaceId: resolvedWorkspaceId,
      orgId: orgId ?? null,
      type: resolvedType,
      day,
      count: incrementCount || 0,
      tokenCount: incrementTokens || null,
      source,
      createdAt: timestamp,
    },
  });
}
