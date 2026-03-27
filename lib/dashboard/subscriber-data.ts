import "server-only";

import type { AnalyticsEventType, PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getEntitlementForUser,
  getWorkspaceScope,
} from "@/lib/entitlements";
import { normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { resolveGlobalDateRange, type GlobalDateRange } from "@/lib/shared/date-range";
import {
  supportsInvoicePaymentLockedFields,
  supportsInvoicePaymentSubaccountFilters,
  withInvoicePaymentSubaccountFilters,
} from "@/lib/shared/invoice-payment-query-compat";
import { convertToDefaultCurrency } from "@/lib/billing/currency-conversion";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriberDashboardData = {
  dateRange: GlobalDateRange;
  generatedAt: string;
  status: "stable" | "attention" | "critical";
  hasConnectedSubaccount: boolean;
  permissions: {
    canViewBilling: boolean;
  };
  overview: {
    revenue: number;
    currency: string;
    revenueTrend: number[];
    revenueNote?: string;
    paymentsCount: number;
    paymentSuccessRate: number;
    invoicesSent: number;
    invoicesOverdue: number;
    messagesSent: number;
    messageDeliveryRate: number;
    automationRuns: number;
    failedAutomations: number;
    aiRequests?: number;
  };
  risk: {
    financialSystemFailure: boolean;
    paymentConnectionIssue: boolean;
    overdueInvoicesCount: number;
    overdueInvoicesAmount: number;
    failedPaymentsCount: number;
    failedAutomationsCount: number;
    undeliveredMessagesCount: number;
  };
  modules: {
    billing: {
      revenue: number;
      paymentsCount: number;
      overdueInvoices: number;
    };
    automation: {
      runs: number;
      failed: number;
      active: number;
    };
    messaging: {
      sent: number;
      delivered: number;
      failed: number;
    };
    ai?: {
      requests: number;
    };
  };
  timeline: Array<{
    id: string;
    status: "success" | "warning" | "failed" | "info";
    title: string;
    customer: string | null;
    invoice: string | null;
    timestamp: string;
  }>;
};

export type SubscriberDashboardScope = {
  orgId: string;
  ownerUserId: string;
  canViewBilling?: boolean;
  canAI?: boolean;
};

function parseMeta(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};
  return record as Record<string, unknown>;
}

function customerFromMeta(meta: Record<string, unknown>) {
  return (
    String(meta.customerName || "").trim() ||
    String(meta.customer || "").trim() ||
    String(meta.customerEmail || "").trim() ||
    "Deleted Customer"
  );
}

function invoiceFromMeta(meta: Record<string, unknown>) {
  return String(meta.invoiceNumber || meta.invoice || "").trim() || null;
}

function daysInRange(from: Date, to: Date) {
  const delta = Math.floor((to.getTime() - from.getTime()) / DAY_MS);
  return Math.max(1, delta + 1);
}

function paymentTimelineStatus(status: string) {
  const normalized = String(status).toUpperCase();
  if (normalized === "FAILED") return "failed" as const;
  if (normalized === "REFUNDED") return "warning" as const;
  if (normalized === "PENDING") return "info" as const;
  return "success" as const;
}

function paymentTimelineTitle(status: string) {
  const normalized = String(status).toUpperCase();
  if (normalized === "FAILED") return "Payment failed";
  if (normalized === "REFUNDED") return "Payment refunded";
  if (normalized === "PENDING") return "Payment pending";
  return "Payment received";
}

function automationTimelineStatus(status: string) {
  const normalized = String(status).toUpperCase();
  if (normalized === "FAILED") return "failed" as const;
  if (normalized === "SUCCESS") return "success" as const;
  return "info" as const;
}

function automationTimelineTitle(status: string) {
  const normalized = String(status).toUpperCase();
  if (normalized === "FAILED") return "Automation failed";
  if (normalized === "SUCCESS") return "Automation completed";
  if (normalized === "RUNNING") return "Automation running";
  return "Automation queued";
}

function messageTimelineStatus(status: string) {
  const normalized = String(status).toUpperCase();
  if (normalized === "FAILED") return "failed" as const;
  if (normalized === "SENT") return "info" as const;
  return "success" as const;
}

function messageTimelineTitle(status: string) {
  const normalized = String(status).toUpperCase();
  if (normalized === "FAILED") return "Message delivery failed";
  if (normalized === "READ") return "Message read";
  if (normalized === "DELIVERED") return "Message delivered";
  return "Message sent";
}

function statusFromRisk(risk: SubscriberDashboardData["risk"]): SubscriberDashboardData["status"] {
  if (risk.financialSystemFailure) {
    return "critical";
  }
  if (
    risk.paymentConnectionIssue ||
    risk.overdueInvoicesCount > 0 ||
    risk.failedAutomationsCount > 0 ||
    risk.failedPaymentsCount > 0 ||
    risk.undeliveredMessagesCount > 0
  ) {
    return "attention";
  }
  return "stable";
}

function toLockedConvertedAmount(record: {
  amount: unknown;
  currency: string;
  amountOriginal?: unknown;
  currencyOriginal?: string | null;
  amountConverted?: unknown;
  currencyDefault?: string | null;
  metadata: unknown;
}, defaultCurrency: string) {
  const converted = Number(record.amountConverted ?? 0);
  const convertedCurrency = String(record.currencyDefault || "").toUpperCase();
  if (Number.isFinite(converted) && convertedCurrency === defaultCurrency) {
    return converted;
  }

  const fallback = convertToDefaultCurrency({
    amountOriginal: Number(record.amountOriginal ?? record.amount ?? 0),
    currencyOriginal: String(record.currencyOriginal || record.currency || "").toUpperCase(),
    defaultCurrency,
    invoicePaymentMetadata: record.metadata,
  });
  return fallback.amount;
}

export async function getSubscriberDashboardData(input: {
  userId: string;
  range?: string | null;
  from?: string | null;
  to?: string | null;
  scope?: SubscriberDashboardScope | null;
}): Promise<SubscriberDashboardData> {
  const dateRange = resolveGlobalDateRange(input);
  const fromDate = new Date(`${dateRange.from}T00:00:00.000Z`);
  const toDate = new Date(`${dateRange.to}T23:59:59.999Z`);
  const targetOrgId = input.scope?.orgId ?? null;
  const targetOwnerUserId = input.scope?.ownerUserId ?? null;
  const workspace = !targetOrgId || !targetOwnerUserId ? await getWorkspaceScope(input.userId) : null;
  const ownerUserId = targetOwnerUserId ?? workspace?.ownerId ?? input.userId;
  const businessId = targetOrgId ?? workspace?.businessId ?? null;
  const analyticsScopeId = businessId ?? ownerUserId;
  const canViewBilling = input.scope?.canViewBilling ?? true;
  const memberUserIds = businessId
    ? Array.from(
        new Set([
          ownerUserId,
          ...(
            await prisma.businessMember.findMany({
              where: { businessId, status: "active" },
              select: { userId: true },
            })
          ).map((member) => member.userId),
        ])
      )
    : workspace?.userIds?.length
      ? Array.from(new Set(workspace.userIds))
      : [ownerUserId];
  const entitlement =
    typeof input.scope?.canAI === "boolean"
      ? null
      : await getEntitlementForUser(ownerUserId);
  const canAI = input.scope?.canAI ?? entitlement?.canAI ?? false;
  const supportsSubaccountFilters = await supportsInvoicePaymentSubaccountFilters();
  const supportsLockedFields = await supportsInvoicePaymentLockedFields();

  const invoicePaymentsSelect = supportsLockedFields
    ? {
        id: true,
        amount: true,
        currency: true,
        amountOriginal: true,
        currencyOriginal: true,
        amountConverted: true,
        currencyDefault: true,
        status: true,
        reference: true,
        createdAt: true,
        metadata: true,
        invoice: { select: { invoiceNumber: true, metadata: true } },
      }
    : {
        id: true,
        amount: true,
        currency: true,
        status: true,
        reference: true,
        createdAt: true,
        metadata: true,
        invoice: { select: { invoiceNumber: true, metadata: true } },
      };

  const revenueWindowSelect = supportsLockedFields
    ? {
        amount: true,
        currency: true,
        amountOriginal: true,
        currencyOriginal: true,
        amountConverted: true,
        currencyDefault: true,
        status: true,
        confirmedAt: true,
        metadata: true,
      }
    : {
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
        metadata: true,
      };

  const [
    businessProfile,
    merchantAccount,
    sentInvoiceAggregate,
    invoicePayments,
    revenueWindowRows,
    invoiceRows,
    overdueInvoices,
    automationRuns,
    automationGroups,
    activeAutomations,
    aiRequests,
    messageRows,
  ] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId: ownerUserId }, select: { defaultCurrency: true } }),
    canViewBilling
      ? prisma.merchantAccount.findUnique({
          where: { userId: ownerUserId },
          select: { paystackSubaccountCode: true, flutterwaveSubaccountId: true, currency: true },
        })
      : Promise.resolve(null),
    canViewBilling
      ? prisma.analyticsEvent.aggregate({
          _sum: { count: true },
          where: {
            workspaceId: analyticsScopeId,
            type: "INVOICE_SENT" satisfies AnalyticsEventType,
            day: { gte: fromDate, lte: toDate },
          },
        })
      : Promise.resolve({ _sum: { count: 0 } }),
    canViewBilling
      ? (prisma.invoicePayment.findMany({
          where: withInvoicePaymentSubaccountFilters(
            {
              userId: ownerUserId,
              createdAt: { gte: fromDate, lte: toDate },
            },
            supportsSubaccountFilters
          ),
          orderBy: { createdAt: "asc" },
          select: invoicePaymentsSelect as any,
        }) as Promise<any[]>)
      : Promise.resolve([] as any[]),
    canViewBilling
      ? (prisma.invoicePayment.findMany({
          where: withInvoicePaymentSubaccountFilters(
            supportsLockedFields
              ? {
                  userId: ownerUserId,
                  confirmedAt: { gte: fromDate, lte: toDate },
                  status: { in: ["SUCCEEDED", "REFUNDED"] as PaymentStatus[] },
                }
              : {
                  userId: ownerUserId,
                  createdAt: { gte: fromDate, lte: toDate },
                  status: { in: ["SUCCEEDED", "REFUNDED"] as PaymentStatus[] },
                },
            supportsSubaccountFilters
          ),
          orderBy: supportsLockedFields ? ({ confirmedAt: "asc" } as const) : ({ createdAt: "asc" } as const),
          select: revenueWindowSelect as any,
        }) as Promise<any[]>)
      : Promise.resolve([] as any[]),
    canViewBilling
      ? prisma.invoice.findMany({
          where: { userId: ownerUserId, subscriptionId: null, generatedAt: { gte: fromDate, lte: toDate } },
          orderBy: { generatedAt: "desc" },
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            total: true,
            currency: true,
            metadata: true,
            generatedAt: true,
          },
        })
      : Promise.resolve([] as any[]),
    canViewBilling
      ? prisma.invoice.findMany({
          where: {
            userId: ownerUserId,
            subscriptionId: null,
            status: "OVERDUE",
            generatedAt: { gte: fromDate, lte: toDate },
          },
          select: { total: true, currency: true },
        })
      : Promise.resolve([] as Array<{ total: number; currency: string }>),
    prisma.automationRun.findMany({
      where: businessId
        ? { flow: { businessId }, createdAt: { gte: fromDate, lte: toDate } }
        : { userId: { in: memberUserIds }, createdAt: { gte: fromDate, lte: toDate } },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: {
        id: true,
        runStatus: true,
        createdAt: true,
        flow: { select: { title: true } },
      },
    }),
    prisma.automationRun.groupBy({
      by: ["runStatus"],
      _count: { _all: true },
      where: businessId
        ? { flow: { businessId }, createdAt: { gte: fromDate, lte: toDate } }
        : { userId: { in: memberUserIds }, createdAt: { gte: fromDate, lte: toDate } },
    }),
    prisma.automationFlow.count({
      where: businessId
        ? { businessId, status: "ACTIVE" }
        : { userId: { in: memberUserIds }, status: "ACTIVE" },
    }),
    canAI
      ? prisma.aiUsageLog.count({
          where: { userId: { in: memberUserIds }, createdAt: { gte: fromDate, lte: toDate } },
        })
      : Promise.resolve(0),
    businessId
      ? prisma.unifiedMessage.findMany({
          where: {
            tenantId: businessId,
            direction: "OUTBOUND",
            createdAt: { gte: fromDate, lte: toDate },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true,
            deliveryStatus: true,
            createdAt: true,
            conversation: {
              select: {
                contact: {
                  select: {
                    name: true,
                    phone: true,
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const hasConnectedSubaccount = Boolean(
    merchantAccount?.paystackSubaccountCode || merchantAccount?.flutterwaveSubaccountId
  );
  const defaultCurrency = normalizeCurrency(
    businessProfile?.defaultCurrency || "USD"
  );

  const paymentStats = {
    success: 0,
    failed: 0,
    refunded: 0,
    total: 0,
  };

  invoicePayments.forEach((row) => {
    const status = String(row.status).toUpperCase();
    if (status === "SUCCEEDED") paymentStats.success += 1;
    if (status === "FAILED") paymentStats.failed += 1;
    if (status === "REFUNDED") paymentStats.refunded += 1;
  });

  let revenue = 0;
  revenueWindowRows.forEach((row) => {
    const lockedAmount = toLockedConvertedAmount(row, defaultCurrency);
    if (String(row.status).toUpperCase() === "REFUNDED") {
      revenue += -Math.abs(lockedAmount);
      return;
    }
    revenue += Math.abs(lockedAmount);
  });

  paymentStats.total = paymentStats.success + paymentStats.failed;
  const paymentSuccessRate = paymentStats.total > 0 ? Math.round((paymentStats.success / paymentStats.total) * 100) : 0;
  const sentInvoiceCount = Math.max(
    Number(sentInvoiceAggregate._sum.count ?? 0),
    invoiceRows.filter((invoice) => String(invoice.status).toUpperCase() !== "DRAFT").length
  );

  const runsStatusMap = new Map<string, number>();
  automationGroups.forEach((group) => runsStatusMap.set(String(group.runStatus).toUpperCase(), group._count._all || 0));
  const failedAutomations = runsStatusMap.get("FAILED") || 0;

  const messageSentCount = messageRows.length;
  const deliveredCount = messageRows.filter((row) =>
    ["DELIVERED", "READ"].includes(String(row.deliveryStatus).toUpperCase())
  ).length;
  const undeliveredMessagesCount = messageRows.filter(
    (row) => String(row.deliveryStatus).toUpperCase() === "FAILED"
  ).length;
  const messageDeliveryRate = messageSentCount > 0 ? Math.round((deliveredCount / messageSentCount) * 100) : 0;

  const overdueInvoicesAmount = overdueInvoices.reduce((sum, invoice) => {
    const converted = convertToDefaultCurrency({
      amountOriginal: Number(invoice.total || 0),
      currencyOriginal: String(invoice.currency || "").toUpperCase(),
      defaultCurrency,
    });
    return sum + converted.amount;
  }, 0);
  const hasBillingActivity =
    sentInvoiceCount > 0 || paymentStats.total > 0 || overdueInvoices.length > 0 || revenueWindowRows.length > 0;

  const financialSystemFailure = !Number.isFinite(revenue);

  const risk = {
    financialSystemFailure: canViewBilling ? financialSystemFailure : false,
    paymentConnectionIssue: canViewBilling ? hasBillingActivity && !hasConnectedSubaccount : false,
    overdueInvoicesCount: canViewBilling ? overdueInvoices.length : 0,
    overdueInvoicesAmount: canViewBilling ? overdueInvoicesAmount : 0,
    failedPaymentsCount: canViewBilling ? paymentStats.failed : 0,
    failedAutomationsCount: failedAutomations,
    undeliveredMessagesCount,
  };

  const revenueTrend = (() => {
    const days = dateRange.key === "today" ? 1 : dateRange.key === "last30" ? 30 : daysInRange(fromDate, toDate);
    const buckets: number[] = Array.from({ length: days }, () => 0);

    revenueWindowRows.forEach((row) => {
      const when = row.confirmedAt || row.createdAt || fromDate;
      const dayOffset = Math.floor((new Date(when).getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
      if (dayOffset < 0 || dayOffset >= days) return;
      const lockedAmount = toLockedConvertedAmount(row, defaultCurrency);
      if (String(row.status).toUpperCase() === "REFUNDED") {
        buckets[dayOffset] += -Math.abs(lockedAmount);
        return;
      }
      buckets[dayOffset] += Math.abs(lockedAmount);
    });

    return buckets;
  })();

  const timeline = [
    ...(canViewBilling
      ? invoicePayments.map((payment) => {
          const invoiceMeta = parseMeta(payment.invoice?.metadata);
          const meta = { ...invoiceMeta, ...parseMeta(payment.metadata) };
          const normalizedStatus = String(payment.status).toUpperCase();
          return {
            id: `payment-${payment.id}`,
            status: paymentTimelineStatus(normalizedStatus),
            title: paymentTimelineTitle(normalizedStatus),
            customer: customerFromMeta(meta),
            invoice: payment.invoice?.invoiceNumber || invoiceFromMeta(meta),
            timestamp: payment.createdAt.toISOString(),
          };
        })
      : []),
    ...(canViewBilling
      ? invoiceRows.map((invoice) => {
          const status = String(invoice.status).toUpperCase();
          return {
            id: `invoice-${invoice.id}`,
            status: status === "OVERDUE" ? ("warning" as const) : ("info" as const),
            title: status === "OVERDUE" ? "Invoice overdue" : "Invoice created",
            customer: customerFromMeta(parseMeta(invoice.metadata)),
            invoice: invoice.invoiceNumber,
            timestamp: invoice.generatedAt.toISOString(),
          };
        })
      : []),
    ...automationRuns.map((run) => {
      const status = String(run.runStatus).toUpperCase();
      return {
        id: `run-${run.id}`,
        status: automationTimelineStatus(status),
        title: automationTimelineTitle(status),
        customer: null,
        invoice: null,
        timestamp: run.createdAt.toISOString(),
      };
    }),
    ...messageRows.map((message) => {
      const status = String(message.deliveryStatus).toUpperCase();
      return {
        id: `message-${message.id}`,
        status: messageTimelineStatus(status),
        title: messageTimelineTitle(status),
        customer: message.conversation.contact?.name || message.conversation.contact?.phone || null,
        invoice: null,
        timestamp: message.createdAt.toISOString(),
      };
    }),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 100);

  const revenueNote = risk.paymentConnectionIssue ? "No payment subaccount connected" : undefined;

  return {
    dateRange,
    generatedAt: new Date().toISOString(),
    status: statusFromRisk(risk),
    hasConnectedSubaccount,
    permissions: {
      canViewBilling,
    },
    overview: {
      revenue: canViewBilling ? revenue : 0,
      currency: defaultCurrency,
      revenueTrend: canViewBilling ? revenueTrend : [],
      ...(revenueNote ? { revenueNote } : {}),
      paymentsCount: canViewBilling ? paymentStats.total : 0,
      paymentSuccessRate: canViewBilling ? paymentSuccessRate : 0,
      invoicesSent: canViewBilling ? sentInvoiceCount : 0,
      invoicesOverdue: canViewBilling ? overdueInvoices.length : 0,
      messagesSent: messageSentCount,
      messageDeliveryRate,
      automationRuns: automationRuns.length,
      failedAutomations,
      ...(canAI ? { aiRequests } : {}),
    },
    risk,
    modules: {
      billing: {
        revenue: canViewBilling ? revenue : 0,
        paymentsCount: canViewBilling ? paymentStats.total : 0,
        overdueInvoices: canViewBilling ? overdueInvoices.length : 0,
      },
      automation: {
        runs: automationRuns.length,
        failed: failedAutomations,
        active: activeAutomations,
      },
      messaging: {
        sent: messageSentCount,
        delivered: deliveredCount,
        failed: undeliveredMessagesCount,
      },
      ...(canAI ? { ai: { requests: aiRequests } } : {}),
    },
    timeline,
  };
}
