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

