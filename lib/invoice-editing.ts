import { normalizeInvoiceItems } from "./invoice";
import { normalizeCurrency } from "./payments/currency-allowlist";

type InvoiceEditGuardInput = {
  existingStatus: string;
  existingInvoiceNumber?: string | null;
  existingCustomerId?: string | null;
  existingCurrency?: string | null;
  existingItems?: unknown;
  existingDiscount?: number | null;
  existingPoNumber?: string | null;
  existingGeneratedAt?: Date | null;
  existingMetadata?: Record<string, unknown> | null;
  parsed: Record<string, unknown>;
  issueDate?: Date;
  dueDate?: Date;
};

function normalizeOptionalString(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalDateString(value?: Date | string | null) {
  if (!value) return null;
  const candidate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(candidate.getTime())) return null;
  return candidate.toISOString().slice(0, 10);
}

function getExistingCustomerMeta(existingMetadata?: Record<string, unknown> | null) {
  const customer =
    existingMetadata?.customer && typeof existingMetadata.customer === "object"
      ? (existingMetadata.customer as Record<string, unknown>)
      : null;
  return customer;
}

function getExistingComplianceMeta(existingMetadata?: Record<string, unknown> | null) {
  const compliance =
    existingMetadata?.compliance && typeof existingMetadata.compliance === "object"
      ? (existingMetadata.compliance as Record<string, unknown>)
      : null;
  return compliance;
}

function getExistingDueDate(existingMetadata?: Record<string, unknown> | null) {
  const dueDate = existingMetadata?.dueDate;
  return typeof dueDate === "string" ? dueDate : null;
}

export function hasMaterialInvoiceContentChanges(input: InvoiceEditGuardInput) {
  const parsed = input.parsed || {};
  const existingMetadata = input.existingMetadata || null;
  const existingCustomer = getExistingCustomerMeta(existingMetadata);
  const existingCompliance = getExistingComplianceMeta(existingMetadata);

  if (
    parsed.invoiceNumber !== undefined &&
    normalizeOptionalString(parsed.invoiceNumber) !== normalizeOptionalString(input.existingInvoiceNumber)
  ) {
    return true;
  }

  if (
    parsed.customerId !== undefined &&
    normalizeOptionalString(parsed.customerId) !== normalizeOptionalString(input.existingCustomerId)
  ) {
    return true;
  }

  if (
    parsed.currency !== undefined &&
    normalizeCurrency(String(parsed.currency || "")) !== normalizeCurrency(String(input.existingCurrency || ""))
  ) {
    return true;
  }

  if (parsed.items !== undefined) {
    const nextItems = JSON.stringify(normalizeInvoiceItems(parsed.items));
    const existingItems = JSON.stringify(normalizeInvoiceItems(input.existingItems));
    if (nextItems !== existingItems) {
      return true;
    }
  }

  if (parsed.discount !== undefined) {
    const nextDiscount = Number(parsed.discount || 0);
    const existingDiscount = Number(input.existingDiscount || 0);
    if (nextDiscount !== existingDiscount) {
      return true;
    }
  }

  if (
    parsed.poNumber !== undefined &&
    normalizeOptionalString(parsed.poNumber) !== normalizeOptionalString(input.existingPoNumber)
  ) {
    return true;
  }

  if (
    parsed.note !== undefined &&
    normalizeOptionalString(parsed.note) !== normalizeOptionalString(existingMetadata?.note)
  ) {
    return true;
  }

  if (
    parsed.customerType !== undefined &&
    normalizeOptionalString(parsed.customerType) !== normalizeOptionalString(existingCustomer?.type)
  ) {
    return true;
  }

  if (
    parsed.customerCompany !== undefined &&
    normalizeOptionalString(parsed.customerCompany) !== normalizeOptionalString(existingCustomer?.companyName)
  ) {
    return true;
  }

  if (
    parsed.buyerType !== undefined &&
    normalizeOptionalString(parsed.buyerType) !== normalizeOptionalString(existingCompliance?.buyerType)
  ) {
    return true;
  }

  if (
    parsed.supplyType !== undefined &&
    normalizeOptionalString(parsed.supplyType) !== normalizeOptionalString(existingCompliance?.supplyType)
  ) {
    return true;
  }

  if (parsed.issueDate !== undefined) {
    const nextIssueDate = normalizeOptionalDateString(input.issueDate);
    const existingIssueDate = normalizeOptionalDateString(input.existingGeneratedAt);
    if (nextIssueDate !== existingIssueDate) {
      return true;
    }
  }

  if (parsed.dueDate !== undefined) {
    const nextDueDate = normalizeOptionalDateString(input.dueDate);
    const existingDueDate = normalizeOptionalDateString(getExistingDueDate(existingMetadata));
    if (nextDueDate !== existingDueDate) {
      return true;
    }
  }

  if (parsed.attachments !== undefined) {
    return true;
  }

  return false;
}

export function getIssuedInvoiceEditBlockingReason(input: InvoiceEditGuardInput) {
  const normalizedStatus = String(input.existingStatus || "").toUpperCase();
  if (normalizedStatus === "DRAFT") return null;
  if (hasMaterialInvoiceContentChanges(input)) {
    return "Issued invoices can no longer be edited. Create a replacement invoice instead.";
  }
  return null;
}
