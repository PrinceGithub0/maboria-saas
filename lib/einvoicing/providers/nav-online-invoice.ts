import { buildBaseValidationResult } from "@/lib/einvoicing/providers/base";
import {
  buildNavReportingPreparation,
  cancelNavOnlineInvoiceReport,
  getNavOnlineInvoiceStatus,
  submitNavOnlineInvoiceReport,
} from "@/lib/einvoicing/providers/nav-online-invoice-client";
import type { EInvoiceProviderAdapter } from "@/lib/einvoicing/types";

const trimOrNull = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const buildLine = (
  item: NonNullable<Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]["items"]>[number],
  index: number
) => {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.unitPrice || 0);
  const lineTotal = Number(item.lineTotal ?? quantity * unitPrice);

  return {
    lineNumber: index + 1,
    description: trimOrNull(item.description || item.name) || `Item ${index + 1}`,
    quantity,
    unitPrice,
    lineTotal,
    unitCode: trimOrNull(item.unitCode) || "EA",
    classificationCode: trimOrNull(item.classificationCode),
    taxCategory: trimOrNull(item.taxCategory) || "VAT",
    taxAmount: Number(item.taxAmount ?? 0),
    taxExemptionReason: trimOrNull(item.taxExemptionReason),
    incomeClassification: trimOrNull(item.incomeClassification),
  };
};

export const navOnlineInvoiceProvider: EInvoiceProviderAdapter = {
  key: "HU_NAV",
  countries: ["HU"],
  documentFormat: "REPORTING",
  supportsClearance: false,
  buildPayload(context) {
    const preparation = buildNavReportingPreparation(context.connection);
    const supplier = context.business || {};
    const customer = context.customer || {};
    const invoiceLines = (context.items || []).map((item, index) => buildLine(item, index));
    const warnings = [
      "Hungary NAV Online Invoice payload is structured for readiness and validation and can be reported when a NAV endpoint is configured.",
      ...preparation.notes,
    ];

    if (!trimOrNull(supplier.legalName)) warnings.push("Supplier legal name is missing for Hungary NAV Online Invoice.");
    if (!trimOrNull(supplier.taxId)) warnings.push("Supplier tax number is missing for Hungary NAV Online Invoice.");
    if (!trimOrNull(customer.legalName || customer.contactName)) warnings.push("Customer legal name is missing for Hungary NAV Online Invoice.");
    if (!invoiceLines.length) warnings.push("Hungary NAV Online Invoice payload needs at least one invoice line.");
    if (!preparation.onboardingReady) {
      warnings.push(`Hungary NAV onboarding is incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.signingReady) {
      warnings.push(`Hungary NAV signing prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.transmissionReady) {
      warnings.push(`Hungary NAV transmission prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Signed NAV invoice payload is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid && !context.transportDocument?.invoiceHash) {
      warnings.push("NAV transaction identifier is not attached to this invoice yet.");
    }

    return {
      externalId: trimOrNull(context.invoiceNumber) || trimOrNull(context.invoiceId) || "nav-draft",
      format: "REPORTING",
      payload: {
        documentProfile: "HU_NAV",
        documentType: "NAV_ONLINE_INVOICE",
        invoiceNumber: trimOrNull(context.invoiceNumber),
        invoiceStatus: trimOrNull(context.invoiceStatus),
        issueDate: trimOrNull(context.issuedAt),
        dueDate: trimOrNull(context.dueDate),
        currencyCode: trimOrNull(context.currency),
        transportPreparation: preparation,
        transportDocument: context.transportDocument || null,
        supplier: {
          legalName: trimOrNull(supplier.legalName),
          taxNumber: trimOrNull(supplier.taxId),
          registrationNumber: trimOrNull(supplier.registrationNumber),
          branchCode: trimOrNull(supplier.branchCode),
        },
        customer: {
          legalName: trimOrNull(customer.legalName || customer.contactName),
          taxNumber: trimOrNull(customer.taxId),
          registrationNumber: trimOrNull(customer.registrationNumber),
          branchCode: trimOrNull(customer.branchCode),
        },
        invoiceLines,
        invoiceTotals: {
          subtotal: Number(context.totals?.subtotal || 0),
          taxAmount: Number(context.totals?.taxAmount || 0),
          discountAmount: Number(context.totals?.discountAmount || 0),
          total: Number(context.totals?.total || 0),
        },
        fiscalSummary: {
          buyerType: trimOrNull(context.compliance?.buyerType),
          supplyType: trimOrNull(context.compliance?.supplyType),
          taxTreatment: trimOrNull(context.compliance?.taxTreatment),
          taxLabel: trimOrNull(context.compliance?.taxLabel) || "VAT",
        },
      },
      warnings,
    };
  },
  validatePayload(payload, context) {
    const baseValidation = buildBaseValidationResult(payload, context);
    const errors = !baseValidation.ok ? [...baseValidation.errors] : [];
    const warnings = [...(baseValidation.ok ? baseValidation.warnings || [] : baseValidation.warnings || [])];
    const supplier = context.business || {};
    const customer = context.customer || {};
    const structuredPayload = payload.payload as Record<string, unknown> | null;
    const preparation = (structuredPayload?.transportPreparation || {}) as {
      onboardingReady?: boolean;
      signingReady?: boolean;
      transmissionReady?: boolean;
      liveSubmissionReady?: boolean;
      liveSubmissionBlockedReason?: string | null;
      missingArtifacts?: string[];
    };
    const invoiceLines = Array.isArray(structuredPayload?.invoiceLines)
      ? (structuredPayload?.invoiceLines as Array<{ classificationCode?: string | null; taxCategory?: string | null }>)
      : [];

    if (!trimOrNull(supplier.legalName)) errors.push("Supplier legal name is required for Hungary NAV Online Invoice.");
    if (!trimOrNull(supplier.taxId)) errors.push("Supplier tax number is required for Hungary NAV Online Invoice.");
    if (!trimOrNull(customer.legalName || customer.contactName)) errors.push("Customer legal name is required for Hungary NAV Online Invoice.");
    if (!invoiceLines.length) errors.push("At least one invoice line is required for Hungary NAV Online Invoice.");

    if (context.compliance?.buyerType === "B2B" && !trimOrNull(customer.taxId)) {
      warnings.push("Buyer tax number is missing for Hungary B2B invoicing.");
    }
    if (!preparation.onboardingReady) {
      warnings.push(`Hungary NAV onboarding is incomplete: ${(preparation.missingArtifacts || []).join(", ")}.`);
    } else if (!preparation.signingReady) {
      warnings.push(`Hungary NAV signing prerequisites are incomplete: ${(preparation.missingArtifacts || []).join(", ")}.`);
    } else if (!preparation.transmissionReady) {
      warnings.push(`Hungary NAV transmission prerequisites are incomplete: ${(preparation.missingArtifacts || []).join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Signed NAV invoice payload is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid && !context.transportDocument?.invoiceHash) {
      warnings.push("NAV transaction identifier is not attached to this invoice yet.");
    }

    invoiceLines.forEach((line, index) => {
      if (!trimOrNull(line.classificationCode)) {
        warnings.push(`Line ${index + 1} is missing a classification code for Hungary NAV.`);
      }
      if (!trimOrNull(line.taxCategory)) {
        warnings.push(`Line ${index + 1} is missing a Hungary tax category.`);
      }
    });

    return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
  },
  buildWarnings(context) {
    const preparation = buildNavReportingPreparation(context.connection);
    const warnings = [
      "Hungary may require NAV Online Invoice reporting even when a PDF invoice is also issued.",
      ...preparation.notes,
    ];
    if (!preparation.onboardingReady) {
      warnings.push(`Hungary NAV onboarding is incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.signingReady) {
      warnings.push(`Hungary NAV signing prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.transmissionReady) {
      warnings.push(`Hungary NAV transmission prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!trimOrNull(context.business?.taxId)) {
      warnings.push("Supplier tax number should be completed before Hungary NAV preparation.");
    }
    if (context.compliance?.buyerType === "B2B" && !trimOrNull(context.customer?.taxId)) {
      warnings.push("Buyer tax number should be completed before Hungary B2B invoicing.");
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Attach the signed NAV invoice payload before enabling live NAV reporting.");
    }
    return warnings;
  },
  async submit(payload, context) {
    return submitNavOnlineInvoiceReport({
      connection: context.connection,
      payload,
    });
  },
  async getStatus(submissionId, context) {
    return getNavOnlineInvoiceStatus({
      connection: context.connection,
      submissionId,
    });
  },
  async cancel(submissionId, context) {
    return cancelNavOnlineInvoiceReport({
      connection: context.connection,
      submissionId,
    });
  },
};
