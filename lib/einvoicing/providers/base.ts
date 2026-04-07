import type {
  EInvoicePayloadBuildResult,
  EInvoiceProviderAdapter,
  EInvoiceProviderContext,
  EInvoiceValidationResult,
} from "@/lib/einvoicing/types";

const requireField = (value: string | null | undefined, label: string, errors: string[]) => {
  if (!String(value || "").trim()) {
    errors.push(`${label} is required for e-invoicing.`);
  }
};

export function buildBaseValidationResult(
  payload: EInvoicePayloadBuildResult,
  context: EInvoiceProviderContext
): EInvoiceValidationResult {
  const errors: string[] = [];
  requireField(context.invoiceNumber, "Invoice number", errors);
  requireField(context.sellerCountry, "Seller country", errors);
  requireField(context.currency, "Invoice currency", errors);
  if (!payload.externalId.trim()) {
    errors.push("External e-invoice ID is required.");
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function createBasePayload(
  context: EInvoiceProviderContext,
  providerKey: EInvoiceProviderAdapter["key"],
  format: EInvoiceProviderAdapter["documentFormat"]
): EInvoicePayloadBuildResult {
  const externalId =
    String(context.invoiceNumber || "").trim() ||
    String(context.invoiceId || "").trim() ||
    `${providerKey.toLowerCase()}-draft`;

  return {
    externalId,
    format,
    payload: {
      providerKey,
      invoiceId: context.invoiceId || null,
      invoiceNumber: context.invoiceNumber || null,
      invoiceStatus: context.invoiceStatus || null,
      sellerCountry: context.sellerCountry || null,
      buyerCountry: context.buyerCountry || null,
      currency: context.currency || null,
      compliance: context.compliance || null,
    },
    warnings: [],
  };
}

export const notConfiguredWarning =
  "Provider transport is not configured yet. This adapter currently prepares payloads and validation only.";
