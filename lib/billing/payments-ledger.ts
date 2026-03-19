import "server-only";

import type { PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { resolveGlobalDateRange, type GlobalDateRange } from "@/lib/shared/date-range";
import {
  supportsInvoicePaymentLockedFields,
  supportsInvoicePaymentSubaccountFilters,
  withInvoicePaymentSubaccountFilters,
} from "@/lib/shared/invoice-payment-query-compat";
import { convertToDefaultCurrency } from "@/lib/billing/currency-conversion";

export type LedgerStatusFilter = "all" | "paid" | "failed" | "refunded" | "pending";

export interface LedgerSummary {
  totalCollected: number;
  successfulCount: number;
  failedCount: number;
  refundedCount: number;
}

export interface LedgerRow {
  paymentId: string;
  createdAt: string;
  customerName: string;
  customerContact: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  reference: string;
  maskedReference: string;
  receiptUrl: string | null;
  canRefund: boolean;
  refundState: "none" | "pending" | "completed";
  refundedAmount: number;
}

export interface PaymentsLedgerResult {
  dateRange: GlobalDateRange;
  summary: LedgerSummary;
  summaryCurrency: string;
  hasConnectedSubaccount: boolean;
  rows: LedgerRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

type InvoicePaymentRecord = {
  id: string;
  createdAt: Date;
  amount: unknown;
  currency: string;
  amountOriginal?: unknown;
  currencyOriginal?: string | null;
  amountConverted?: unknown;
  currencyDefault?: string | null;
  provider: string;
  status: PaymentStatus;
  reference: string;
  refundOfId?: string | null;
  metadata: unknown;
  refundEntries?: Array<{
    id: string;
    amount: unknown;
    amountOriginal?: unknown;
    status: PaymentStatus;
  }>;
  invoice: {
    id: string;
    invoiceNumber: string;
    metadata: unknown;
  } | null;
};

function statusToDb(status: LedgerStatusFilter): PaymentStatus | null {
  if (status === "paid") return "SUCCEEDED";
  if (status === "failed") return "FAILED";
  if (status === "refunded") return "REFUNDED";
  if (status === "pending") return "PENDING";
  return null;
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function parseMeta(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};
  return record as Record<string, unknown>;
}

function customerFromMetadata(invoiceMeta: Record<string, unknown>, paymentMeta: Record<string, unknown>) {
  return (
    normalizeText(invoiceMeta.customerName) ||
    normalizeText(invoiceMeta.customer) ||
    normalizeText(invoiceMeta.name) ||
    normalizeText(paymentMeta.customerName) ||
    normalizeText(paymentMeta.customer) ||
    normalizeText(paymentMeta.name) ||
    "Deleted Customer"
  );
}

function customerContactFromMetadata(invoiceMeta: Record<string, unknown>, paymentMeta: Record<string, unknown>) {
  return (
    normalizeText(invoiceMeta.customerEmail) ||
    normalizeText(invoiceMeta.email) ||
    normalizeText(invoiceMeta.customerPhone) ||
    normalizeText(invoiceMeta.phone) ||
    normalizeText(paymentMeta.customerEmail) ||
    normalizeText(paymentMeta.email) ||
    normalizeText(paymentMeta.customerPhone) ||
    normalizeText(paymentMeta.phone) ||
    "--"
  );
}

function invoiceFromRecord(record: InvoicePaymentRecord, invoiceMeta: Record<string, unknown>, paymentMeta: Record<string, unknown>) {
  return (
    normalizeText(record.invoice?.invoiceNumber) ||
    normalizeText(invoiceMeta.invoiceNumber) ||
    normalizeText(paymentMeta.invoiceNumber) ||
    "--"
  );
}

function methodFromMetadata(invoiceMeta: Record<string, unknown>, paymentMeta: Record<string, unknown>) {
  return (
    normalizeText(invoiceMeta.paymentMethod) ||
    normalizeText(invoiceMeta.method) ||
    normalizeText(paymentMeta.paymentMethod) ||
    normalizeText(paymentMeta.method) ||
    normalizeText(paymentMeta.channel) ||
    "Online payment"
  );
}

function maskReference(reference: string) {
  if (!reference) return "--";
  if (reference.length <= 10) return reference;
  return `${reference.slice(0, 4)}...${reference.slice(-4)}`;
}

function parseRefundRequestMeta(value: unknown) {
  const meta = parseMeta(value);
  const refundRequest = parseMeta(meta.refundRequest);
  const normalizedStatus = String(refundRequest.status || "").toLowerCase();
  return {
    status: normalizedStatus,
    requestedAt: normalizeText(refundRequest.requestedAt),
  };
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

type QueryArgs = {
  userId: string;
  range?: string | null;
  from?: string | null;
  to?: string | null;
  status?: string | null;
  query?: string | null;
  page?: number;
  pageSize?: number;
};

export async function getPaymentsLedgerData(args: QueryArgs): Promise<PaymentsLedgerResult> {
  const dateRange = resolveGlobalDateRange({
    range: args.range,
    from: args.from,
    to: args.to,
  });
  const page = Math.max(1, Number(args.page || 1));
  const pageSize = Math.min(100, Math.max(10, Number(args.pageSize || 20)));
  const query = String(args.query || "").trim().toLowerCase();
  const statusFilter = (String(args.status || "all").toLowerCase() as LedgerStatusFilter) || "all";
  const status = statusToDb(statusFilter);
  const supportsSubaccountFilters = await supportsInvoicePaymentSubaccountFilters();
  const supportsLockedFields = await supportsInvoicePaymentLockedFields();

  const fromDate = new Date(`${dateRange.from}T00:00:00.000Z`);
  const toDate = new Date(`${dateRange.to}T23:59:59.999Z`);

  const [businessProfile, merchantAccount] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId: args.userId }, select: { defaultCurrency: true } }),
    prisma.merchantAccount.findUnique({
      where: { userId: args.userId },
      select: { paystackSubaccountCode: true, flutterwaveSubaccountId: true, currency: true },
    }),
  ]);

  const summaryCurrency = normalizeCurrency(
    businessProfile?.defaultCurrency || "USD"
  );
  const hasConnectedSubaccount = Boolean(
    merchantAccount?.paystackSubaccountCode || merchantAccount?.flutterwaveSubaccountId
  );

  const baseWhere = withInvoicePaymentSubaccountFilters({
    userId: args.userId,
    createdAt: {
      gte: fromDate,
      lte: toDate,
    },
    ...(status ? { status } : {}),
  }, supportsSubaccountFilters);

  const revenueWindowRows = await prisma.invoicePayment.findMany({
    where: withInvoicePaymentSubaccountFilters(
      supportsLockedFields
        ? {
            userId: args.userId,
            confirmedAt: { gte: fromDate, lte: toDate },
            status: { in: ["SUCCEEDED", "REFUNDED"] as PaymentStatus[] },
          }
        : {
            userId: args.userId,
            createdAt: { gte: fromDate, lte: toDate },
            status: { in: ["SUCCEEDED", "REFUNDED"] as PaymentStatus[] },
          },
      supportsSubaccountFilters
    ),
    select: (supportsLockedFields
      ? {
          amount: true,
          currency: true,
          amountOriginal: true,
          currencyOriginal: true,
          amountConverted: true,
          currencyDefault: true,
          metadata: true,
          status: true,
        }
      : {
          amount: true,
          currency: true,
          metadata: true,
          status: true,
        }) as any,
  }) as any[];

  const failedCount = await prisma.invoicePayment.count({
    where: withInvoicePaymentSubaccountFilters({
      userId: args.userId,
      createdAt: { gte: fromDate, lte: toDate },
      status: "FAILED" as PaymentStatus,
    }, supportsSubaccountFilters),
  });

  let totalCollected = 0;
  let successfulCount = 0;
  let refundedCount = 0;

  revenueWindowRows.forEach((row) => {
    const converted = toLockedConvertedAmount(row, summaryCurrency);
    if (row.status === "SUCCEEDED") {
      successfulCount += 1;
      totalCollected += Math.abs(converted);
      return;
    }

    refundedCount += 1;
    totalCollected += -Math.abs(converted);
  });

  const summary: LedgerSummary = {
    totalCollected,
    successfulCount,
    failedCount,
    refundedCount,
  };

  let records: InvoicePaymentRecord[] = [];
  let totalRows = 0;

  const selectShape = {
    id: true,
    createdAt: true,
    amount: true,
    currency: true,
    ...(supportsLockedFields
      ? {
          amountOriginal: true,
          currencyOriginal: true,
          amountConverted: true,
          currencyDefault: true,
        }
      : {}),
    provider: true,
    status: true,
    reference: true,
    refundOfId: true,
    metadata: true,
    refundEntries: {
      select: {
        id: true,
        amount: true,
        amountOriginal: true,
        status: true,
      },
    },
    invoice: {
      select: {
        id: true,
        invoiceNumber: true,
        metadata: true,
      },
    },
  } as const;

  if (query) {
    const raw = await prisma.invoicePayment.findMany({
      where: baseWhere,
      orderBy: { createdAt: "desc" },
      take: 800,
      select: selectShape,
    });
    const filtered = raw.filter((row) => {
      const invoiceMeta = parseMeta(row.invoice?.metadata);
      const paymentMeta = parseMeta(row.metadata);
      const haystack = [
        customerFromMetadata(invoiceMeta, paymentMeta),
        customerContactFromMetadata(invoiceMeta, paymentMeta),
        invoiceFromRecord(row, invoiceMeta, paymentMeta),
        row.reference,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
    totalRows = filtered.length;
    const startIndex = (page - 1) * pageSize;
    records = filtered.slice(startIndex, startIndex + pageSize);
  } else {
    totalRows = await prisma.invoicePayment.count({ where: baseWhere });
    records = await prisma.invoicePayment.findMany({
      where: baseWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: selectShape,
    });
  }

  const receiptLinks = await prisma.invoicePayment.findMany({
    where: {
      id: { in: records.map((row) => row.id) },
    },
    select: {
      id: true,
      invoiceId: true,
      receipt: { select: { pdfUrl: true } },
    },
  });

  const receiptMap = new Map<string, { receiptUrl: string | null; invoiceId: string }>();
  receiptLinks.forEach((row) => {
    receiptMap.set(row.id, {
      receiptUrl: row.receipt?.pdfUrl || null,
      invoiceId: row.invoiceId,
    });
  });

  const rows: LedgerRow[] = records.map((record) => {
    const invoiceMeta = parseMeta(record.invoice?.metadata);
    const paymentMeta = parseMeta(record.metadata);
    const receiptInfo = receiptMap.get(record.id);
    const convertedAmount = toLockedConvertedAmount(record, summaryCurrency);
    const refundRequest = parseRefundRequestMeta(record.metadata);
    const refundedAmount = (record.refundEntries || []).reduce((sum, entry) => {
      if (String(entry.status).toUpperCase() !== "REFUNDED") return sum;
      return sum + Math.abs(Number(entry.amountOriginal ?? entry.amount ?? 0));
    }, 0);
    const originalAmount = Math.abs(Number(record.amountOriginal ?? record.amount ?? 0));
    const refundPending =
      Boolean(refundRequest.status) &&
      !["completed", "refunded", "succeeded", "failed", "cancelled", "canceled", "rejected"].includes(
        refundRequest.status
      );
    const fullyRefunded =
      originalAmount > 0 && refundedAmount >= Math.max(0, Number((originalAmount - 0.01).toFixed(2)));
    const canRefund =
      String(record.status).toUpperCase() === "SUCCEEDED" &&
      !record.refundOfId &&
      !refundPending &&
      !fullyRefunded;

    return {
      paymentId: record.id,
      createdAt: record.createdAt.toISOString(),
      customerName: customerFromMetadata(invoiceMeta, paymentMeta),
      customerContact: customerContactFromMetadata(invoiceMeta, paymentMeta),
      invoiceNumber: invoiceFromRecord(record, invoiceMeta, paymentMeta),
      amount: convertedAmount,
      currency: summaryCurrency,
      method: methodFromMetadata(invoiceMeta, paymentMeta),
      status: String(record.status).toUpperCase(),
      reference: record.reference || "--",
      maskedReference: maskReference(record.reference),
      receiptUrl:
        receiptInfo?.receiptUrl ||
        (receiptInfo?.invoiceId
          ? `/dashboard/invoices/${receiptInfo.invoiceId}`
          : record.invoice?.id
            ? `/dashboard/invoices/${record.invoice.id}`
            : null),
      canRefund,
      refundState: fullyRefunded ? "completed" : refundPending ? "pending" : "none",
      refundedAmount,
    };
  });

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return {
    dateRange,
    summary,
    summaryCurrency,
    hasConnectedSubaccount,
    rows,
    page,
    pageSize,
    totalRows,
    totalPages,
  };
}
