import { buildBaseValidationResult } from "@/lib/einvoicing/providers/base";
import {
  buildDteTransmissionPreparation,
  cancelDteDocument,
  getDteSubmissionStatus,
  submitDteDocument,
} from "@/lib/einvoicing/providers/dte-client";
import type { EInvoiceProviderAdapter } from "@/lib/einvoicing/types";

const trimOrNull = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const normalizeRut = (value?: string | null) => {
  const trimmed = trimOrNull(value);
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, "").replace(/\./g, "").toUpperCase();
};

const buildPartyAddress = (party: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}) => ({
  street: trimOrNull(party.addressLine1),
  additionalStreet: trimOrNull(party.addressLine2),
  city: trimOrNull(party.city),
  region: trimOrNull(party.state),
  postalCode: trimOrNull(party.postalCode),
  countryCode: trimOrNull(party.country),
});

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
    taxCategory: trimOrNull(item.taxCategory) || "IVA",
    taxAmount: Number(item.taxAmount ?? 0),
    taxExemptionReason: trimOrNull(item.taxExemptionReason),
    incomeClassification: trimOrNull(item.incomeClassification),
  };
};

export const dteProvider: EInvoiceProviderAdapter = {
  key: "CL_DTE",
  countries: ["CL"],
  documentFormat: "UBL_XML",
  supportsClearance: true,
  buildPayload(context) {
    const preparation = buildDteTransmissionPreparation(context.connection);
    const supplier = context.business || {};
    const customer = context.customer || {};
    const invoiceLines = (context.items || []).map((item, index) => buildLine(item, index));
    const warnings = [
      "Chile DTE payload is structured for readiness and validation and can be submitted when an accredited endpoint is configured.",
      ...preparation.notes,
    ];

    if (!trimOrNull(supplier.legalName)) warnings.push("Supplier legal name is missing for Chile DTE.");
    if (!normalizeRut(supplier.taxId)) warnings.push("Supplier RUT is missing for Chile DTE.");
    if (!trimOrNull(supplier.addressLine1)) warnings.push("Supplier address line 1 is missing for Chile DTE.");
    if (!trimOrNull(customer.legalName || customer.contactName)) warnings.push("Customer legal name is missing for Chile DTE.");
    if (context.compliance?.buyerType === "B2B" && !normalizeRut(customer.taxId)) {
      warnings.push("Buyer RUT is missing for a Chile B2B invoice.");
    }
    if (!invoiceLines.length) warnings.push("Chile DTE payload needs at least one invoice line.");
    if (!preparation.onboardingReady) {
      warnings.push(`Chile DTE onboarding is incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.signingReady) {
      warnings.push(`Chile DTE signing prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Signed DTE XML is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid && !context.transportDocument?.invoiceHash) {
      warnings.push("SII track ID or DTE folio reference is not attached to this invoice yet.");
    }

    return {
      externalId: trimOrNull(context.invoiceNumber) || trimOrNull(context.invoiceId) || "dte-draft",
      format: "UBL_XML",
      payload: {
        documentProfile: "CL_DTE",
        documentType: "DTE",
        invoiceNumber: trimOrNull(context.invoiceNumber),
        invoiceStatus: trimOrNull(context.invoiceStatus),
        issueDate: trimOrNull(context.issuedAt),
        dueDate: trimOrNull(context.dueDate),
        currencyCode: trimOrNull(context.currency),
        transportPreparation: preparation,
        transportDocument: context.transportDocument || null,
        supplier: {
          legalName: trimOrNull(supplier.legalName),
          rut: normalizeRut(supplier.taxId),
          registrationNumber: trimOrNull(supplier.registrationNumber),
          branchCode: trimOrNull(supplier.branchCode),
          address: buildPartyAddress(supplier),
          email: trimOrNull(supplier.email),
          phone: trimOrNull(supplier.phone),
        },
        customer: {
          legalName: trimOrNull(customer.legalName || customer.contactName),
          rut: normalizeRut(customer.taxId),
          registrationNumber: trimOrNull(customer.registrationNumber),
          branchCode: trimOrNull(customer.branchCode),
          address: buildPartyAddress(customer),
          email: trimOrNull(customer.email),
          phone: trimOrNull(customer.phone),
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
          taxLabel: trimOrNull(context.compliance?.taxLabel) || "IVA",
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
      ? (structuredPayload?.invoiceLines as Array<{ lineNumber?: number; classificationCode?: string | null; taxCategory?: string | null }>)
      : [];

    if (!trimOrNull(supplier.legalName)) errors.push("Supplier legal name is required for Chile DTE.");
    if (!normalizeRut(supplier.taxId)) errors.push("Supplier RUT is required for Chile DTE.");
    if (!trimOrNull(supplier.addressLine1)) errors.push("Supplier address line 1 is required for Chile DTE.");
    if (!trimOrNull(customer.legalName || customer.contactName)) errors.push("Customer legal name is required for Chile DTE.");
    if (!invoiceLines.length) errors.push("At least one invoice line is required for Chile DTE.");

    if (context.compliance?.buyerType === "B2B" && !normalizeRut(customer.taxId)) {
      warnings.push("Buyer RUT is missing for Chile B2B invoicing.");
    }
    if (!preparation.onboardingReady) {
      warnings.push(`Chile DTE onboarding is incomplete: ${(preparation.missingArtifacts || []).join(", ")}.`);
    }
    if (preparation.onboardingReady && !preparation.signingReady) {
      warnings.push(`Chile DTE signing prerequisites are incomplete: ${(preparation.missingArtifacts || []).join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Signed DTE XML is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid && !context.transportDocument?.invoiceHash) {
      warnings.push("SII track ID or DTE folio reference is not attached to this invoice yet.");
    }

    invoiceLines.forEach((line, index) => {
      if (!trimOrNull(line.classificationCode)) {
        warnings.push(`Line ${index + 1} is missing a classification code for Chile DTE.`);
      }
      if (!trimOrNull(line.taxCategory)) {
        warnings.push(`Line ${index + 1} is missing a Chile tax category.`);
      }
    });

    return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
  },
  buildWarnings(context) {
    const preparation = buildDteTransmissionPreparation(context.connection);
    const warnings = [
      "Chile may require SII electronic tax document submission in addition to the PDF invoice.",
      ...preparation.notes,
    ];
    if (!preparation.onboardingReady) {
      warnings.push(`Chile DTE onboarding is incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.signingReady) {
      warnings.push(`Chile DTE signing prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!normalizeRut(context.business?.taxId)) {
      warnings.push("Supplier RUT should be completed before Chile DTE preparation.");
    }
    if (context.compliance?.buyerType === "B2B" && !normalizeRut(context.customer?.taxId)) {
      warnings.push("Buyer RUT should be completed before Chile B2B invoicing.");
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Attach the signed DTE XML before enabling live SII submission.");
    }
    return warnings;
  },
  async submit(payload, context) {
    return submitDteDocument({
      connection: context.connection,
      payload,
    });
  },
  async getStatus(submissionId, context) {
    return getDteSubmissionStatus({
      connection: context.connection,
      submissionId,
    });
  },
  async cancel(submissionId, context) {
    return cancelDteDocument({
      connection: context.connection,
      submissionId,
    });
  },
};
