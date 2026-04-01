export const CUSTOMER_OUTSTANDING_INVOICE_STATUSES = ["SENT", "OVERDUE", "FAILED"] as const;
export const CUSTOMER_REMINDER_INVOICE_STATUSES = CUSTOMER_OUTSTANDING_INVOICE_STATUSES;

export function normalizeCustomerInvoiceStatus(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

export function isCustomerOutstandingInvoiceStatus(value: unknown) {
  return CUSTOMER_OUTSTANDING_INVOICE_STATUSES.includes(
    normalizeCustomerInvoiceStatus(value) as (typeof CUSTOMER_OUTSTANDING_INVOICE_STATUSES)[number]
  );
}

export function isCustomerReminderInvoiceStatus(value: unknown) {
  return CUSTOMER_REMINDER_INVOICE_STATUSES.includes(
    normalizeCustomerInvoiceStatus(value) as (typeof CUSTOMER_REMINDER_INVOICE_STATUSES)[number]
  );
}
