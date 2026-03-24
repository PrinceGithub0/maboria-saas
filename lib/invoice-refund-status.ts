type InvoicePaymentLike = {
  status?: unknown;
  refundOfId?: unknown;
  amount?: unknown;
  amountOriginal?: unknown;
};

type InvoiceLike = {
  status?: unknown;
  invoicePayments?: InvoicePaymentLike[] | null;
};

export type InvoiceDisplayStatus =
  | "DRAFT"
  | "SENT"
  | "PAID"
  | "FAILED"
  | "OVERDUE"
  | "CANCELED"
  | "EXPIRED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type InvoiceSummaryCounts = {
  total: number;
  drafts: number;
  unpaid: number;
  overdue: number;
  paid: number;
  refunded: number;
  partiallyRefunded: number;
};

export function deriveInvoiceDisplayStatus(invoice: InvoiceLike): InvoiceDisplayStatus {
  const baseStatus = String(invoice?.status || "").toUpperCase() as InvoiceDisplayStatus;
  if (baseStatus !== "PAID") {
    return baseStatus || "DRAFT";
  }

  const payments = Array.isArray(invoice?.invoicePayments) ? invoice.invoicePayments : [];
  const paidAmount = payments.reduce((sum, payment) => {
    if (String(payment?.status || "").toUpperCase() !== "SUCCEEDED") return sum;
    if (payment?.refundOfId) return sum;
    const amount = Math.abs(Number(payment?.amountOriginal ?? payment?.amount ?? 0));
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const refundedAmount = payments.reduce((sum, payment) => {
    if (String(payment?.status || "").toUpperCase() !== "REFUNDED") return sum;
    const amount = Math.abs(Number(payment?.amountOriginal ?? payment?.amount ?? 0));
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  if (refundedAmount <= 0 || paidAmount <= 0) {
    return baseStatus;
  }

  if (refundedAmount >= Math.max(0, Number((paidAmount - 0.01).toFixed(2)))) {
    return "REFUNDED";
  }

  return "PARTIALLY_REFUNDED";
}

export function getInvoiceSummaryCounts(invoices: InvoiceLike[]): InvoiceSummaryCounts {
  return invoices.reduce<InvoiceSummaryCounts>(
    (summary, invoice) => {
      const displayStatus = deriveInvoiceDisplayStatus(invoice);
      summary.total += 1;

      if (displayStatus === "DRAFT") {
        summary.drafts += 1;
      }
      if (displayStatus === "SENT" || displayStatus === "OVERDUE") {
        summary.unpaid += 1;
      }
      if (displayStatus === "OVERDUE") {
        summary.overdue += 1;
      }
      if (displayStatus === "PAID") {
        summary.paid += 1;
      }
      if (displayStatus === "REFUNDED") {
        summary.refunded += 1;
      }
      if (displayStatus === "PARTIALLY_REFUNDED") {
        summary.partiallyRefunded += 1;
      }

      return summary;
    },
    {
      total: 0,
      drafts: 0,
      unpaid: 0,
      overdue: 0,
      paid: 0,
      refunded: 0,
      partiallyRefunded: 0,
    }
  );
}
