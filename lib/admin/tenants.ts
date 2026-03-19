import "server-only";

import {
  Prisma,
  SubscriptionPlan,
  SupportThreadPriority,
  SupportThreadStatus,
  UsageFeatureKey,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AdminTenantAccessStatus,
  AdminTenantDetailResponse,
  AdminTenantListItem,
  AdminTenantListResponse,
  AdminTenantSort,
} from "@/lib/admin/tenants-types";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const ORDER_BY_CREATED_DESC: Prisma.BusinessOrderByWithRelationInput = { createdAt: "desc" };
const ORDER_BY_CREATED_ASC: Prisma.BusinessOrderByWithRelationInput = { createdAt: "asc" };
const ORDER_BY_ACTIVITY_DESC: Prisma.BusinessOrderByWithRelationInput = { createdAt: "desc" };
const ORDER_BY_ACTIVITY_ASC: Prisma.BusinessOrderByWithRelationInput = { createdAt: "asc" };

function parsePositiveInt(input: string | null | undefined, fallback: number) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function parsePage(input: string | null | undefined) {
  return parsePositiveInt(input, DEFAULT_PAGE);
}

function parsePageSize(input: string | null | undefined) {
  return Math.min(parsePositiveInt(input, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
}

function parseSort(input: string | null | undefined): AdminTenantSort {
  const normalized = String(input || "").trim().toLowerCase();
  if (normalized === "created_asc") return "created_asc";
  if (normalized === "activity_desc") return "activity_desc";
  if (normalized === "activity_asc") return "activity_asc";
  return "created_desc";
}

function parseTenantStatus(input: string | null | undefined): AdminTenantAccessStatus | null {
  const normalized = String(input || "").trim().toUpperCase();
  if (normalized === "ACTIVE") return "ACTIVE";
  if (normalized === "SUSPENDED") return "SUSPENDED";
  if (normalized === "DISABLED") return "DISABLED";
  return null;
}

function parsePlan(input: string | null | undefined): SubscriptionPlan | null {
  const normalized = String(input || "").trim().toUpperCase();
  if (normalized === "STARTER") return "STARTER";
  if (normalized === "PRO") return "PRO";
  if (normalized === "GROWTH") return "GROWTH";
  if (normalized === "BUSINESS") return "BUSINESS";
  if (normalized === "ENTERPRISE") return "ENTERPRISE";
  if (normalized === "PREMIUM") return "PREMIUM";
  return null;
}

function buildOrderBy(sort: AdminTenantSort): Prisma.BusinessOrderByWithRelationInput {
  if (sort === "created_asc") return ORDER_BY_CREATED_ASC;
  if (sort === "activity_desc") return ORDER_BY_ACTIVITY_DESC;
  if (sort === "activity_asc") return ORDER_BY_ACTIVITY_ASC;
  return ORDER_BY_CREATED_DESC;
}

function buildListWhere(input: {
  query?: string | null;
  status?: string | null;
  plan?: string | null;
}): Prisma.BusinessWhereInput {
  const query = String(input.query || "").trim();
  const parsedStatus = parseTenantStatus(input.status);
  const parsedPlan = parsePlan(input.plan);
  const andFilters: Prisma.BusinessWhereInput[] = [];

  if (query) {
    andFilters.push({
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { id: { equals: query } },
        { domain: { contains: query, mode: "insensitive" } },
        { owner: { email: { contains: query, mode: "insensitive" } } },
        { owner: { name: { contains: query, mode: "insensitive" } } },
      ],
    });
  }

  if (parsedStatus) {
    andFilters.push({ accessStatus: parsedStatus });
  }

  if (parsedPlan) {
    andFilters.push({
      OR: [{ plan: parsedPlan }, { orgSubscription: { is: { planId: parsedPlan } } }],
    });
  }

  if (!andFilters.length) return {};
  return { AND: andFilters };
}

function toIso(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function pickLatestDate(values: Array<Date | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
}

export async function listAdminTenants(input: {
  query?: string | null;
  status?: string | null;
  plan?: string | null;
  page?: string | null;
  pageSize?: string | null;
  sort?: string | null;
}): Promise<AdminTenantListResponse> {
  const page = parsePage(input.page);
  const pageSize = parsePageSize(input.pageSize);
  const sort = parseSort(input.sort);
  const where = buildListWhere(input);

  const [totalItems, businesses] = await Promise.all([
    prisma.business.count({ where }),
    prisma.business.findMany({
      where,
      include: {
        owner: {
          select: { id: true, name: true, email: true, publicId: true },
        },
        orgSubscription: {
          select: { planId: true, status: true },
        },
      },
      orderBy: buildOrderBy(sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const tenantIds = businesses.map((item) => item.id);
  const [auditActivity, supportActivity, messageActivity, supportRisk, webhookRisk] =
    tenantIds.length === 0
      ? [[], [], [], [], []]
      : await Promise.all([
          prisma.auditLog.groupBy({
            by: ["orgId"],
            where: { orgId: { in: tenantIds } },
            _max: { createdAt: true },
          }),
          prisma.supportThreadTicket.groupBy({
            by: ["workspaceId"],
            where: { workspaceId: { in: tenantIds } },
            _max: { lastActivityAt: true },
          }),
          prisma.unifiedMessage.groupBy({
            by: ["tenantId"],
            where: { tenantId: { in: tenantIds } },
            _max: { createdAt: true },
          }),
          prisma.supportThreadTicket.groupBy({
            by: ["workspaceId"],
            where: {
              workspaceId: { in: tenantIds },
              status: { in: [SupportThreadStatus.OPEN, SupportThreadStatus.PENDING] },
              priority: { in: [SupportThreadPriority.HIGH, SupportThreadPriority.URGENT] },
            },
            _count: { _all: true },
          }),
          prisma.unifiedAuditEvent.groupBy({
            by: ["tenantId"],
            where: {
              tenantId: { in: tenantIds },
              actionType: { startsWith: "webhook.failure" },
              createdAt: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              },
            },
            _count: { _all: true },
          }),
        ]);

  const auditMap = new Map<string, Date>();
  for (const item of auditActivity) {
    if (item.orgId && item._max.createdAt) {
      auditMap.set(item.orgId, item._max.createdAt);
    }
  }

  const supportMap = new Map<string, Date>();
  for (const item of supportActivity) {
    if (item.workspaceId && item._max.lastActivityAt) {
      supportMap.set(item.workspaceId, item._max.lastActivityAt);
    }
  }

  const messageMap = new Map<string, Date>();
  for (const item of messageActivity) {
    if (item.tenantId && item._max.createdAt) {
      messageMap.set(item.tenantId, item._max.createdAt);
    }
  }

  const supportRiskMap = new Map<string, number>();
  for (const item of supportRisk) {
    supportRiskMap.set(item.workspaceId, item._count._all);
  }

  const webhookRiskMap = new Map<string, number>();
  for (const item of webhookRisk) {
    webhookRiskMap.set(item.tenantId, item._count._all);
  }

  let items: AdminTenantListItem[] = businesses.map((business) => {
    const lastActivityAt = pickLatestDate([
      business.createdAt,
      auditMap.get(business.id),
      supportMap.get(business.id),
      messageMap.get(business.id),
    ]);
    return {
      id: business.id,
      name: business.name,
      status: business.accessStatus,
      createdAt: business.createdAt.toISOString(),
      lastActivityAt: toIso(lastActivityAt),
      plan: business.orgSubscription?.planId || business.plan || null,
      subscriptionStatus: business.orgSubscription?.status || null,
      owner: {
        id: business.owner.id,
        name: business.owner.name,
        email: business.owner.email,
        publicId: business.owner.publicId ?? null,
      },
      riskFlags: (supportRiskMap.get(business.id) || 0) + (webhookRiskMap.get(business.id) || 0),
    };
  });

  if (sort === "activity_desc" || sort === "activity_asc") {
    items = items.sort((a, b) => {
      const aDate = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const bDate = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return sort === "activity_desc" ? bDate - aDate : aDate - bDate;
    });
  }

  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}

export async function getAdminTenantDetail(tenantId: string): Promise<AdminTenantDetailResponse | null> {
  const business = await prisma.business.findUnique({
    where: { id: tenantId },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          publicId: true,
          merchantAccount: {
            select: {
              provider: true,
              paystackSubaccountCode: true,
              flutterwaveSubaccountId: true,
              updatedAt: true,
            },
          },
        },
      },
      orgSubscription: {
        select: {
          planId: true,
          status: true,
          billingInterval: true,
          provider: true,
          providerCustomerId: true,
          providerSubscriptionId: true,
          paidThroughAt: true,
          currentCycleStartAt: true,
          currentCycleEndAt: true,
          apiAccessEnabled: true,
        },
      },
    },
  });
  if (!business) return null;

  const members = await prisma.businessMember.findMany({
    where: { businessId: tenantId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          publicId: true,
          role: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  const activeMemberUserIds = members
    .filter((member) => String(member.status || "").toLowerCase() === "active")
    .map((member) => member.userId);
  const uniqueActiveMemberUserIds = Array.from(new Set(activeMemberUserIds));

  const [
    customersCount,
    invoicesCount,
    automationsCount,
    conversationsCount,
    openHighPriorityTickets,
    webhookFailures7d,
  ] = await Promise.all([
    uniqueActiveMemberUserIds.length
      ? prisma.customer.count({ where: { userId: { in: uniqueActiveMemberUserIds } } })
      : 0,
    uniqueActiveMemberUserIds.length
      ? prisma.invoice.count({ where: { userId: { in: uniqueActiveMemberUserIds } } })
      : 0,
    prisma.automationFlow.count({ where: { businessId: tenantId } }),
    prisma.unifiedConversation.count({ where: { tenantId } }),
    prisma.supportThreadTicket.count({
      where: {
        workspaceId: tenantId,
        status: { in: [SupportThreadStatus.OPEN, SupportThreadStatus.PENDING] },
        priority: { in: [SupportThreadPriority.HIGH, SupportThreadPriority.URGENT] },
      },
    }),
    prisma.unifiedAuditEvent.count({
      where: {
        tenantId,
        actionType: { startsWith: "webhook.failure" },
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  const now = new Date();
  const periodStart =
    business.orgSubscription?.currentCycleStartAt || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd =
    business.orgSubscription?.currentCycleEndAt || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [usageByFeature, latestUsageCounter, auditLogs, systemLogs, lastAuditActivity] = await Promise.all([
    prisma.usageEvent.groupBy({
      by: ["featureKey"],
      where: {
        orgId: tenantId,
        occurredAt: { gte: periodStart, lt: periodEnd },
      },
      _sum: { quantity: true },
    }),
    prisma.unifiedUsageCounter.findFirst({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: { orgId: tenantId },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: {
        id: true,
        userId: true,
        actionType: true,
        action: true,
        createdAt: true,
        metadata: true,
      },
    }),
    prisma.unifiedAuditEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: {
        id: true,
        actorUserId: true,
        actionType: true,
        createdAt: true,
        metadata: true,
      },
    }),
    prisma.auditLog.findFirst({
      where: { orgId: tenantId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const usageMap = new Map<UsageFeatureKey, number>();
  for (const item of usageByFeature) {
    usageMap.set(item.featureKey, item._sum.quantity || 0);
  }

  const usageCounters = [
    { feature: "ai_requests", quantity: usageMap.get("AI_REQUESTS") || 0 },
    { feature: "invoices", quantity: usageMap.get("INVOICES") || 0 },
    { feature: "whatsapp_messages", quantity: usageMap.get("WHATSAPP_MESSAGES") || 0 },
    { feature: "automations_runs", quantity: usageMap.get("AUTOMATIONS_RUNS") || 0 },
    { feature: "team_members_seats", quantity: usageMap.get("TEAM_MEMBERS_SEATS") || 0 },
  ];

  const mergedLogs = [
    ...auditLogs.map((log) => ({
      id: log.id,
      source: "audit" as const,
      action: log.actionType || log.action,
      actorUserId: log.userId,
      createdAt: log.createdAt.toISOString(),
      metadata: log.metadata,
    })),
    ...systemLogs.map((log) => ({
      id: log.id,
      source: "system" as const,
      action: log.actionType,
      actorUserId: log.actorUserId,
      createdAt: log.createdAt.toISOString(),
      metadata: log.metadata,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 120);

  return {
    tenant: {
      id: business.id,
      name: business.name,
      domain: business.domain ?? null,
      status: business.accessStatus,
      createdAt: business.createdAt.toISOString(),
      suspendedAt: toIso(business.suspendedAt),
      suspendedReason: business.suspendedReason ?? null,
      lastActivityAt: toIso(pickLatestDate([business.createdAt, lastAuditActivity?.createdAt])),
    },
    owner: {
      id: business.owner.id,
      name: business.owner.name,
      email: business.owner.email,
      publicId: business.owner.publicId ?? null,
    },
    subscription: {
      plan: business.orgSubscription?.planId || business.plan || null,
      status: business.orgSubscription?.status || null,
      billingInterval: business.orgSubscription?.billingInterval || null,
      provider: business.orgSubscription?.provider || null,
      providerCustomerId: business.orgSubscription?.providerCustomerId || null,
      providerSubscriptionId: business.orgSubscription?.providerSubscriptionId || null,
      paidThroughAt: toIso(business.orgSubscription?.paidThroughAt),
      currentCycleStartAt: toIso(business.orgSubscription?.currentCycleStartAt),
      currentCycleEndAt: toIso(business.orgSubscription?.currentCycleEndAt),
      apiAccessEnabled: Boolean(business.orgSubscription?.apiAccessEnabled),
    },
    overview: {
      stats: {
        users: uniqueActiveMemberUserIds.length,
        customers: customersCount,
        invoices: invoicesCount,
        automations: automationsCount,
        conversations: conversationsCount,
      },
      integrations: {
        paystackSubaccountCode: business.owner.merchantAccount?.paystackSubaccountCode || null,
        flutterwaveSubaccountId: business.owner.merchantAccount?.flutterwaveSubaccountId || null,
        payoutProvider: business.owner.merchantAccount?.provider || null,
        updatedAt: toIso(business.owner.merchantAccount?.updatedAt),
      },
      riskSignals: {
        openHighPriorityTickets,
        webhookFailures7d,
      },
    },
    users: members.map((member) => ({
      id: member.id,
      role: member.role,
      status: member.status,
      joinedAt: toIso(member.joinedAt),
      createdAt: member.createdAt.toISOString(),
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        publicId: member.user.publicId ?? null,
        role: member.user.role,
      },
    })),
    usage: {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      counters: usageCounters,
      channelTotals: latestUsageCounter
        ? {
            billingPeriod: latestUsageCounter.billingPeriod,
            emailMessagesSent: latestUsageCounter.emailMessagesSent,
            whatsappMessagesSent: latestUsageCounter.whatsappMessagesSent,
            totalMessagesSent: latestUsageCounter.totalMessagesSent,
            updatedAt: latestUsageCounter.updatedAt.toISOString(),
          }
        : null,
    },
    billing: {
      provider: business.orgSubscription?.provider || null,
      providerCustomerId: business.orgSubscription?.providerCustomerId || null,
      providerSubscriptionId: business.orgSubscription?.providerSubscriptionId || null,
      billingInterval: business.orgSubscription?.billingInterval || null,
      paidThroughAt: toIso(business.orgSubscription?.paidThroughAt),
      currentCycleStartAt: toIso(business.orgSubscription?.currentCycleStartAt),
      currentCycleEndAt: toIso(business.orgSubscription?.currentCycleEndAt),
      apiAccessEnabled: Boolean(business.orgSubscription?.apiAccessEnabled),
      paystackSubaccountCode: business.owner.merchantAccount?.paystackSubaccountCode || null,
      flutterwaveSubaccountId: business.owner.merchantAccount?.flutterwaveSubaccountId || null,
      lastSyncAt: toIso(business.owner.merchantAccount?.updatedAt),
      webhookHealth: "unknown",
    },
    logs: mergedLogs,
  };
}

export async function suspendTenant(input: {
  tenantId: string;
  actorAdminUserId: string;
  reason?: string | null;
}) {
  const existing = await prisma.business.findUnique({
    where: { id: input.tenantId },
    select: {
      id: true,
      accessStatus: true,
    },
  });
  if (!existing) return null;

  if (existing.accessStatus === "SUSPENDED") {
    return {
      tenantId: existing.id,
      status: existing.accessStatus,
      changed: false,
    };
  }

  const reason = String(input.reason || "").trim() || null;

  const updated = await prisma.$transaction(async (tx) => {
    const tenant = await tx.business.update({
      where: { id: input.tenantId },
      data: {
        accessStatus: "SUSPENDED",
        suspendedAt: new Date(),
        suspendedReason: reason,
      },
      select: {
        id: true,
        accessStatus: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: input.actorAdminUserId,
        orgId: tenant.id,
        action: "tenant.suspended",
        actionType: "tenant.suspended",
        metadata: {
          reason,
          previousStatus: existing.accessStatus,
        },
      },
    });

    return tenant;
  });

  return {
    tenantId: updated.id,
    status: updated.accessStatus,
    changed: true,
  };
}

export async function reactivateTenant(input: {
  tenantId: string;
  actorAdminUserId: string;
}) {
  const existing = await prisma.business.findUnique({
    where: { id: input.tenantId },
    select: {
      id: true,
      accessStatus: true,
    },
  });
  if (!existing) return null;

  if (existing.accessStatus === "ACTIVE") {
    return {
      tenantId: existing.id,
      status: existing.accessStatus,
      changed: false,
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const tenant = await tx.business.update({
      where: { id: input.tenantId },
      data: {
        accessStatus: "ACTIVE",
        suspendedAt: null,
        suspendedReason: null,
      },
      select: {
        id: true,
        accessStatus: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: input.actorAdminUserId,
        orgId: tenant.id,
        action: "tenant.reactivated",
        actionType: "tenant.reactivated",
        metadata: {
          previousStatus: existing.accessStatus,
        },
      },
    });

    return tenant;
  });

  return {
    tenantId: updated.id,
    status: updated.accessStatus,
    changed: true,
  };
}
