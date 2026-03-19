import "server-only";

import { convertToDefaultCurrency } from "@/lib/billing/currency-conversion";

type InvoiceAmountRecord = {
  total: unknown;
  currency: string | null | undefined;
};

type InvoicePaymentAmountRecord = {
  amount: unknown;
  currency: string | null | undefined;
  amountOriginal?: unknown;
  currencyOriginal?: string | null;
  amountConverted?: unknown;
  currencyDefault?: string | null;
  metadata?: unknown;
  status?: string | null;
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
