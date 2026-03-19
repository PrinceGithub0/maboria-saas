import "server-only";

import { prisma } from "./prisma";
import { getWorkspaceScope } from "@/lib/entitlements";
import { recordUsageEvent, UsageFeatureApiKey } from "@/lib/usage/ledger";

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
  idempotencyKey?: string;
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
  idempotencyKey,
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
    await maybeWriteUsageEvent({
      userId,
      orgId,
      workspaceId,
      type: resolvedType,
      count: incrementCount || 1,
      createdAt: timestamp,
      source,
      idempotencyKey,
    });
    return;
  }

  const created = await prisma.analyticsEvent.create({
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

  await maybeWriteUsageEvent({
    userId,
    orgId,
    workspaceId,
    type: resolvedType,
    count: incrementCount || 1,
    createdAt: timestamp,
    source,
    idempotencyKey: idempotencyKey ?? `analytics:${created.id}`,
  });
}

async function resolveOrgId({
  userId,
  orgId,
  workspaceId,
}: {
  userId: string;
  orgId?: string | null;
  workspaceId?: string | null;
}) {
  const directId = orgId || workspaceId;
  if (directId) {
    const business = await prisma.business.findUnique({
      where: { id: directId },
      select: { id: true },
    });
    if (business?.id) return business.id;
  }
  const scope = await getWorkspaceScope(userId);
  return scope.businessId ?? null;
}

function mapAnalyticsTypeToUsageFeature(type: AnalyticsEventType): UsageFeatureApiKey | null {
  if (type === "AI_REQUEST") return "ai_requests";
  if (type === "INVOICE_SENT") return "invoices";
  if (type === "AUTOMATION_RUN") return "automations_runs";
  if (type === "WHATSAPP_MESSAGE" || type === "WHATSAPP_MESSAGE_SENT") return "whatsapp_messages";
  return null;
}

async function maybeWriteUsageEvent({
  userId,
  orgId,
  workspaceId,
  type,
  count,
  createdAt,
  source,
  idempotencyKey,
}: {
  userId: string;
  orgId?: string | null;
  workspaceId?: string | null;
  type: AnalyticsEventType;
  count: number;
  createdAt: Date;
  source: string;
  idempotencyKey?: string;
}) {
  const featureKey = mapAnalyticsTypeToUsageFeature(type);
  if (!featureKey || !idempotencyKey) return;

  const resolvedOrgId = await resolveOrgId({ userId, orgId, workspaceId });
  if (!resolvedOrgId) return;

  await recordUsageEvent({
    orgId: resolvedOrgId,
    userId,
    featureKey,
    quantity: count,
    occurredAt: createdAt,
    source: source === "webhook" ? "WEBHOOK" : source === "system" ? "SYSTEM" : "APP",
    idempotencyKey,
  });
}
