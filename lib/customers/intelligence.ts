import "server-only";

import { convertToDefaultCurrency } from "@/lib/billing/currency-conversion";
import { isCustomerOutstandingInvoiceStatus, normalizeCustomerInvoiceStatus } from "@/lib/customers/statuses";

type InvoiceAmountRecord = {
  total: unknown;
  currency: string | null | undefined;
};

type InvoicePaymentAmountRecord = {
  invoiceId?: string | null;
  amount: unknown;
  currency: string | null | undefined;
  amountOriginal?: unknown;
  currencyOriginal?: string | null;
  amountConverted?: unknown;
  currencyDefault?: string | null;
  metadata?: unknown;
  status?: string | null;
};

type CustomerInvoiceMetricsRecord = InvoiceAmountRecord & {
  id: string;
  customerId: string;
  status?: string | null;
  generatedAt?: Date | string | null;
};

export type CustomerMetrics = {
  invoiced: number;
  paid: number;
  outstanding: number;
  lastInvoiceAt: string | null;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const createEmptyMetrics = (): CustomerMetrics => ({
  invoiced: 0,
  paid: 0,
  outstanding: 0,
  lastInvoiceAt: null,
});

const toDate = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function convertCustomerInvoiceAmount(
  invoice: InvoiceAmountRecord,
  displayCurrency: string
) {
  const converted = convertToDefaultCurrency({
    amountOriginal: Number(invoice.total || 0),
    currencyOriginal: String(invoice.currency || "").toUpperCase(),
    defaultCurrency: displayCurrency,
  });
  return converted.amount;
}

export function convertCustomerPaymentAmount(
  payment: InvoicePaymentAmountRecord,
  displayCurrency: string
) {
  const lockedAmount = Number(payment.amountConverted ?? Number.NaN);
  const lockedCurrency = String(payment.currencyDefault || "").toUpperCase();
  if (Number.isFinite(lockedAmount) && lockedCurrency === displayCurrency) {
    return lockedAmount;
  }

  const converted = convertToDefaultCurrency({
    amountOriginal: Number(payment.amountOriginal ?? payment.amount ?? 0),
    currencyOriginal: String(payment.currencyOriginal || payment.currency || "").toUpperCase(),
    defaultCurrency: displayCurrency,
    invoicePaymentMetadata: payment.metadata,
  });
  const normalizedStatus = String(payment.status || "").toUpperCase();
  if (normalizedStatus === "REFUNDED") {
    return -Math.abs(converted.amount);
  }
  if (normalizedStatus === "SUCCEEDED") {
    return Math.abs(converted.amount);
  }
  return converted.amount;
}

export function buildCustomerMetricsMap(input: {
  invoices: CustomerInvoiceMetricsRecord[];
  payments: InvoicePaymentAmountRecord[];
  displayCurrency: string;
}) {
  const metricsMap = new Map<string, CustomerMetrics>();
  const invoiceCustomerMap = new Map(input.invoices.map((invoice) => [invoice.id, invoice.customerId]));
  const netPaymentsByInvoice = new Map<string, number>();

  for (const payment of input.payments) {
    const invoiceId = String(payment.invoiceId || "");
    if (!invoiceId) continue;

    const normalizedStatus = normalizeCustomerInvoiceStatus(payment.status);
    if (normalizedStatus !== "SUCCEEDED" && normalizedStatus !== "REFUNDED") continue;

    const customerId = invoiceCustomerMap.get(invoiceId);
    if (!customerId) continue;

    const amount = convertCustomerPaymentAmount(payment, input.displayCurrency);
    if (!Number.isFinite(amount)) continue;

    netPaymentsByInvoice.set(invoiceId, roundMoney((netPaymentsByInvoice.get(invoiceId) || 0) + amount));

    const current = metricsMap.get(customerId) || createEmptyMetrics();
    current.paid = roundMoney(current.paid + amount);
    metricsMap.set(customerId, current);
  }

  for (const invoice of input.invoices) {
    const current = metricsMap.get(invoice.customerId) || createEmptyMetrics();
    const amount = convertCustomerInvoiceAmount(invoice, input.displayCurrency);

    current.invoiced = roundMoney(current.invoiced + amount);

    if (isCustomerOutstandingInvoiceStatus(invoice.status)) {
      const netPaid = netPaymentsByInvoice.get(invoice.id) || 0;
      current.outstanding = roundMoney(current.outstanding + Math.max(0, roundMoney(amount - netPaid)));
    }

    const generatedAt = toDate(invoice.generatedAt);
    if (generatedAt && (!current.lastInvoiceAt || generatedAt > new Date(current.lastInvoiceAt))) {
      current.lastInvoiceAt = generatedAt.toISOString();
    }

    metricsMap.set(invoice.customerId, current);
  }

  for (const [customerId, metrics] of metricsMap.entries()) {
    metricsMap.set(customerId, {
      invoiced: roundMoney(Math.max(0, metrics.invoiced)),
      paid: roundMoney(Math.max(0, metrics.paid)),
      outstanding: roundMoney(Math.max(0, metrics.outstanding)),
      lastInvoiceAt: metrics.lastInvoiceAt,
    });
  }

  return { metricsMap, netPaymentsByInvoice };
}
