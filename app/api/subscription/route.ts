import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { OrgBillingInterval, OrgSubscriptionStatus } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { subscriptionPlanToUserPlan, syncBusinessPlanForUser } from "@/lib/entitlements";
import { assertRateLimit } from "@/lib/rate-limit";
import { subscriptionSchema } from "@/lib/validators";
import { withErrorHandling } from "@/lib/api-handler";
import { requireOrgPermission, resolveOrgContext, writeOrgAuditLog } from "@/lib/org-auth";
import { ensureCurrentSubscriptionForOrg } from "@/lib/subscription-downgrade";
import { deriveSubscriptionManagement } from "@/lib/subscription-management";
import { addCalendarMonthUtcKeepingTime, clampAnchorDay } from "@/lib/usage/cycle";
import { requireSystemFlag } from "@/lib/system-flags-guard";

function mapOrgStatusToSubscriptionStatus(status: string | null | undefined) {
  const value = String(status || "").toUpperCase();
  if (value === "ACTIVE") return "ACTIVE";
  if (value === "PAST_DUE") return "PAST_DUE";
  if (value === "TRIALING") return "TRIALING";
  if (value === "CANCELED") return "CANCELED";
  return "INACTIVE";
}

function mapSubscriptionStatusToOrgStatus(status: string | null | undefined): OrgSubscriptionStatus {
  const value = String(status || "").toUpperCase();
  if (value === "PAST_DUE") return "PAST_DUE";
  if (value === "TRIALING") return "TRIALING";
  if (value === "CANCELED" || value === "INACTIVE" || value === "REVOKED") return "CANCELED";
  return "ACTIVE";
}

function mapIntervalToOrgBillingInterval(interval: string | null | undefined): OrgBillingInterval {
  return String(interval || "").toLowerCase() === "yearly" ? "YEARLY" : "MONTHLY";
}

function mapSubscriptionRowToView(sub: {
  id: string;
  plan: string;
  status: string;
  renewalDate: Date;
  usageLimit: number | null;
  usagePeriod: string | null;
  currency: string;
  graceEndsAt: Date | null;
  cancellationReason: string | null;
  overageUsed: number;
  interval: string | null;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
  receiptUrl: string | null;
  receiptNumber: string | null;
  receiptIssuedAt: Date | null;
  lastPaymentReference: string | null;
  lastPaymentProvider: string | null;
  pendingPlan: string | null;
  pendingEffectiveAt: Date | null;
}) {
  return {
    id: sub.id,
    plan: sub.plan,
    status: mapOrgStatusToSubscriptionStatus(sub.status),
    renewalDate: sub.renewalDate,
    usageLimit: sub.usageLimit,
    usagePeriod: sub.usagePeriod || "monthly",
    currency: sub.currency || "USD",
    graceEndsAt: sub.graceEndsAt,
    cancellationReason: sub.cancellationReason,
    overageUsed: sub.overageUsed,
    interval: sub.interval || "monthly",
    billingInterval: sub.interval || "monthly",
    autoRenew: sub.autoRenew,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
    invoices: [],
    receiptUrl: sub.receiptUrl,
    receiptNumber: sub.receiptNumber,
    receiptIssuedAt: sub.receiptIssuedAt,
    lastPaymentReference: sub.lastPaymentReference,
    lastPaymentProvider: sub.lastPaymentProvider,
    pendingPlan: sub.pendingPlan,
    pendingEffectiveAt: sub.pendingEffectiveAt,
  };
}

function mapOrgSubscriptionToView(input: {
  id: string;
  ownerUserId: string;
  planId: string;
  status: string;
  currentCycleEndAt: Date;
  billingInterval: OrgBillingInterval;
  createdAt: Date;
  updatedAt: Date;
  provider: string | null;
}) {
  return {
    id: input.id,
    userId: input.ownerUserId,
    plan: input.planId,
    status: mapOrgStatusToSubscriptionStatus(input.status),
    renewalDate: input.currentCycleEndAt,
    usageLimit: null,
    usagePeriod: "monthly",
    currency: "USD",
    graceEndsAt: null,
    cancellationReason: null,
    overageUsed: 0,
    interval: input.billingInterval === "YEARLY" ? "yearly" : "monthly",
    billingInterval: input.billingInterval === "YEARLY" ? "yearly" : "monthly",
    autoRenew: null,
    cancelAtPeriodEnd: null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    invoices: [],
    receiptUrl: null,
    receiptNumber: null,
    receiptIssuedAt: null,
    lastPaymentReference: null,
    lastPaymentProvider: input.provider,
    pendingPlan: null,
    pendingEffectiveAt: null,
  };
}

const SUBSCRIPTION_HISTORY_PAGE_SIZE = 10;
const SUBSCRIPTION_HISTORY_MAX_PAGE_SIZE = 50;

function normalizeHistoryLimit(value: string | null) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return SUBSCRIPTION_HISTORY_PAGE_SIZE;
  return Math.max(1, Math.min(parsed, SUBSCRIPTION_HISTORY_MAX_PAGE_SIZE));
}

function encodeHistoryCursor(input: { createdAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({ createdAt: input.createdAt.toISOString(), id: input.id }), "utf8").toString("base64url");
}

function decodeHistoryCursor(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      createdAt?: string;
      id?: string;
    };
    if (!parsed?.createdAt || !parsed?.id) return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await resolveOrgContext(session.user.id);
  if (!context) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const scope = new URL(req.url).searchParams.get("scope");
  if (scope === "status_check") {
    return NextResponse.json({
      status: mapOrgStatusToSubscriptionStatus(context.orgSubscriptionStatus),
      plan: context.orgPlan,
      role: context.role,
      orgId: context.orgId,
      accessStatus: context.orgAccessStatus,
    });
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "subscription:manage",
    requireActiveSubscription: false,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  if (scope === "summary") {
    const [activeSubscription, latestReceipt, orgSub] = await Promise.all([
      ensureCurrentSubscriptionForOrg(access.context.ownerUserId, access.context.orgId),
      prisma.subscription.findFirst({
        where: {
          userId: access.context.ownerUserId,
          receiptUrl: { not: null },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      }),
      prisma.orgSubscription.findUnique({
        where: { orgId: access.context.orgId },
        select: {
          id: true,
          planId: true,
          status: true,
          currentCycleEndAt: true,
          billingInterval: true,
          createdAt: true,
          updatedAt: true,
          provider: true,
          providerCustomerId: true,
        },
      }),
    ]);

    const stateSource = activeSubscription
      ? "subscription"
      : orgSub
        ? "org_subscription"
        : "none";
    const management = deriveSubscriptionManagement({
      provider: activeSubscription?.provider ?? orgSub?.provider ?? null,
      providerCustomerId: orgSub?.providerCustomerId ?? null,
      stateSource,
    });

    const active =
      activeSubscription
        ? mapSubscriptionRowToView(activeSubscription)
        : orgSub
          ? mapOrgSubscriptionToView({
              ...orgSub,
              ownerUserId: access.context.ownerUserId,
            })
          : null;

    return NextResponse.json({
      active,
      hasReceipt: Boolean(latestReceipt),
      management,
    });
  }

  if (scope === "history") {
    await ensureCurrentSubscriptionForOrg(access.context.ownerUserId, access.context.orgId);

    const searchParams = new URL(req.url).searchParams;
    const limit = normalizeHistoryLimit(searchParams.get("limit"));
    const cursor = decodeHistoryCursor(searchParams.get("cursor"));
    const cursorWhere = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : null;

    const rows = await prisma.subscription.findMany({
      where: cursorWhere ? { userId: access.context.ownerUserId, AND: [cursorWhere] } : { userId: access.context.ownerUserId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        plan: true,
        status: true,
        renewalDate: true,
        usageLimit: true,
        usagePeriod: true,
        currency: true,
        graceEndsAt: true,
        cancellationReason: true,
        overageUsed: true,
        interval: true,
        autoRenew: true,
        cancelAtPeriodEnd: true,
        createdAt: true,
        updatedAt: true,
        receiptUrl: true,
        receiptNumber: true,
        receiptIssuedAt: true,
        lastPaymentReference: true,
        lastPaymentProvider: true,
        pendingPlan: true,
        pendingEffectiveAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const visibleRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? encodeHistoryCursor({
          createdAt: visibleRows[visibleRows.length - 1]!.createdAt,
          id: visibleRows[visibleRows.length - 1]!.id,
        })
      : null;

    if (visibleRows.length > 0) {
      return NextResponse.json({
        items: visibleRows.map((sub) => mapSubscriptionRowToView(sub)),
        pagination: {
          pageSize: limit,
          hasMore,
          nextCursor,
        },
      });
    }

    if (!cursor) {
      const orgSub = await prisma.orgSubscription.findUnique({ where: { orgId: access.context.orgId } });
      if (orgSub) {
        return NextResponse.json({
          items: [
            mapOrgSubscriptionToView({
              ...orgSub,
              ownerUserId: access.context.ownerUserId,
            }),
          ],
          pagination: {
            pageSize: limit,
            hasMore: false,
            nextCursor: null,
          },
        });
      }
    }

    return NextResponse.json({
      items: [],
      pagination: {
        pageSize: limit,
        hasMore: false,
        nextCursor: null,
      },
    });
  }

  await ensureCurrentSubscriptionForOrg(access.context.ownerUserId, access.context.orgId);

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: access.context.ownerUserId },
    orderBy: [{ renewalDate: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      plan: true,
      status: true,
      renewalDate: true,
      usageLimit: true,
      usagePeriod: true,
      currency: true,
      graceEndsAt: true,
      cancellationReason: true,
      overageUsed: true,
      interval: true,
      autoRenew: true,
      cancelAtPeriodEnd: true,
      createdAt: true,
      updatedAt: true,
      receiptUrl: true,
      receiptNumber: true,
      receiptIssuedAt: true,
      lastPaymentReference: true,
      lastPaymentProvider: true,
      pendingPlan: true,
      pendingEffectiveAt: true,
    },
  });
  if (subscriptions.length > 0) {
    return NextResponse.json(subscriptions.map((sub) => mapSubscriptionRowToView(sub)));
  }

  const orgSub = await prisma.orgSubscription.findUnique({ where: { orgId: access.context.orgId } });
  if (!orgSub) {
    return NextResponse.json([]);
  }

  const subView = mapOrgSubscriptionToView({
    ...orgSub,
    ownerUserId: access.context.ownerUserId,
  });

  return NextResponse.json([subView]);
});

export const POST = withErrorHandling(async (req: Request) => {
  const paymentsDisabled = await requireSystemFlag("payments_enabled", "Payments are currently disabled.");
  if (paymentsDisabled) return paymentsDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireOrgPermission(session.user.id, {
    permission: "subscription:manage",
    requireActiveSubscription: false,
  });
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

  const { plan, status, renewalDate, usageLimit, usagePeriod } = subscriptionSchema.parse(await req.json());
  assertRateLimit(`sub:${session.user.id}`, 10, 60_000);

  const sub = await prisma.subscription.create({
    data: {
      userId: access.context.ownerUserId,
      plan,
      status,
      renewalDate: renewalDate ? new Date(renewalDate) : new Date(),
      usageLimit,
      usagePeriod,
    },
  });

  const now = new Date();
  const existingOrgSub = await prisma.orgSubscription.findUnique({
    where: { orgId: access.context.orgId },
    select: { id: true, activationTimestamp: true, currentCycleStartAt: true, currentCycleEndAt: true },
  });

  await prisma.orgSubscription.upsert({
    where: { orgId: access.context.orgId },
    update: {
      planId: sub.plan,
      status: mapSubscriptionStatusToOrgStatus(sub.status),
      billingInterval: mapIntervalToOrgBillingInterval(sub.interval),
      provider: sub.provider,
      providerSubscriptionId: sub.id,
      paidThroughAt: sub.renewalDate ?? null,
      apiAccessEnabled: sub.plan === "ENTERPRISE",
    },
    create: {
      orgId: access.context.orgId,
      planId: sub.plan,
      status: mapSubscriptionStatusToOrgStatus(sub.status),
      billingInterval: mapIntervalToOrgBillingInterval(sub.interval),
      provider: sub.provider,
      providerSubscriptionId: sub.id,
      paidThroughAt: sub.renewalDate ?? null,
      usageCycleAnchorDay: clampAnchorDay(now.getUTCDate()),
      activationTimestamp: existingOrgSub?.activationTimestamp ?? now,
      currentCycleStartAt: existingOrgSub?.currentCycleStartAt ?? now,
      currentCycleEndAt: existingOrgSub?.currentCycleEndAt ?? addCalendarMonthUtcKeepingTime(now, 1),
      apiAccessEnabled: sub.plan === "ENTERPRISE",
    },
  });

  await syncBusinessPlanForUser(access.context.ownerUserId, subscriptionPlanToUserPlan(sub.plan));

  await writeOrgAuditLog({
    orgId: access.context.orgId,
    actorUserId: session.user.id,
    actionType: "SUBSCRIPTION_UPGRADED",
    metadata: { plan: sub.plan, status: sub.status },
  });

  return NextResponse.json(sub, { status: 201 });
});

export const PUT = withErrorHandling(async (req: Request) => {
  const paymentsDisabled = await requireSystemFlag("payments_enabled", "Payments are currently disabled.");
  if (paymentsDisabled) return paymentsDisabled;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireOrgPermission(session.user.id, {
    permission: "subscription:manage",
    requireActiveSubscription: false,
  });
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

  const { id, status, plan, usageLimit, usagePeriod } = await req.json();
  const existing = await prisma.subscription.findFirst({
    where: { id, userId: access.context.ownerUserId },
    select: { id: true, interval: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  const sub = await prisma.subscription.update({
    where: { id: existing.id },
    data: { status, plan, usageLimit, usagePeriod },
  });

  const orgSub = await prisma.orgSubscription.findUnique({
    where: { orgId: access.context.orgId },
    select: {
      activationTimestamp: true,
      currentCycleStartAt: true,
      currentCycleEndAt: true,
    },
  });
  const now = new Date();
  await prisma.orgSubscription.upsert({
    where: { orgId: access.context.orgId },
    update: {
      planId: sub.plan,
      status: mapSubscriptionStatusToOrgStatus(sub.status),
      billingInterval: mapIntervalToOrgBillingInterval(sub.interval ?? existing.interval),
      provider: sub.provider,
      providerSubscriptionId: sub.id,
      paidThroughAt: sub.renewalDate ?? null,
      apiAccessEnabled: sub.plan === "ENTERPRISE",
    },
    create: {
      orgId: access.context.orgId,
      planId: sub.plan,
      status: mapSubscriptionStatusToOrgStatus(sub.status),
      billingInterval: mapIntervalToOrgBillingInterval(sub.interval ?? existing.interval),
      provider: sub.provider,
      providerSubscriptionId: sub.id,
      paidThroughAt: sub.renewalDate ?? null,
      usageCycleAnchorDay: clampAnchorDay(now.getUTCDate()),
      activationTimestamp: orgSub?.activationTimestamp ?? now,
      currentCycleStartAt: orgSub?.currentCycleStartAt ?? now,
      currentCycleEndAt: orgSub?.currentCycleEndAt ?? addCalendarMonthUtcKeepingTime(now, 1),
      apiAccessEnabled: sub.plan === "ENTERPRISE",
    },
  });

  await syncBusinessPlanForUser(access.context.ownerUserId, subscriptionPlanToUserPlan(sub.plan));

  await writeOrgAuditLog({
    orgId: access.context.orgId,
    actorUserId: session.user.id,
    actionType: status === "CANCELED" ? "SUBSCRIPTION_CANCELED" : "SUBSCRIPTION_DOWNGRADED",
    metadata: { plan: sub.plan, status: sub.status },
  });

  return NextResponse.json(sub);
});
