import { buildBaseValidationResult } from "@/lib/einvoicing/providers/base";
import {
  buildSunatSigningPreparation,
  cancelSunatDocument,
  getSunatSubmissionStatus,
  submitSunatDocument,
} from "@/lib/einvoicing/providers/sunat-client";
import type { EInvoiceProviderAdapter } from "@/lib/einvoicing/types";

const trimOrNull = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
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
    unitCode: trimOrNull(item.unitCode) || "NIU",
    classificationCode: trimOrNull(item.classificationCode),
    taxCategory: trimOrNull(item.taxCategory) || "IGV",
    taxAmount: Number(item.taxAmount ?? 0),
    taxExemptionReason: trimOrNull(item.taxExemptionReason),
    incomeClassification: trimOrNull(item.incomeClassification),
  };
};

export const sunatProvider: EInvoiceProviderAdapter = {
  key: "PE_SUNAT",
  countries: ["PE"],
  documentFormat: "UBL_XML",
  supportsClearance: true,
  buildPayload(context) {
    const preparation = buildSunatSigningPreparation(context.connection);
    const supplier = context.business || {};
    const customer = context.customer || {};
    const invoiceLines = (context.items || []).map((item, index) => buildLine(item, index));
    const warnings = [
      "Peru SUNAT payload is structured for readiness and validation and can be submitted when a SUNAT or OSE endpoint is configured.",
      ...preparation.notes,
    ];

    if (!trimOrNull(supplier.legalName)) warnings.push("Supplier legal name is missing for Peru SUNAT.");
    if (!trimOrNull(supplier.taxId)) warnings.push("Supplier RUC is missing for Peru SUNAT.");
    if (!trimOrNull(supplier.addressLine1)) warnings.push("Supplier address line 1 is missing for Peru SUNAT.");
    if (!trimOrNull(customer.legalName || customer.contactName)) warnings.push("Customer legal name is missing for Peru SUNAT.");
    if (context.compliance?.buyerType === "B2B" && !trimOrNull(customer.taxId)) {
      warnings.push("Buyer RUC is missing for a Peru B2B invoice.");
    }
    if (!invoiceLines.length) warnings.push("Peru SUNAT payload needs at least one invoice line.");
    if (!preparation.onboardingReady) {
      warnings.push(`Peru SUNAT onboarding is incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.signingReady) {
      warnings.push(`Peru SUNAT signing prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.transmissionReady) {
      warnings.push(`Peru SUNAT transmission prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Signed SUNAT UBL XML is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid && !context.transportDocument?.invoiceHash) {
      warnings.push("SUNAT ticket or CDR reference is not attached to this invoice yet.");
    }

    return {
      externalId: trimOrNull(context.invoiceNumber) || trimOrNull(context.invoiceId) || "sunat-draft",
      format: "UBL_XML",
      payload: {
        documentProfile: "PE_SUNAT",
        documentType: "SUNAT",
        invoiceNumber: trimOrNull(context.invoiceNumber),
        invoiceStatus: trimOrNull(context.invoiceStatus),
        issueDate: trimOrNull(context.issuedAt),
        dueDate: trimOrNull(context.dueDate),
        currencyCode: trimOrNull(context.currency),
        transportPreparation: preparation,
        transportDocument: context.transportDocument || null,
        supplier: {
          legalName: trimOrNull(supplier.legalName),
          ruc: trimOrNull(supplier.taxId),
          registrationNumber: trimOrNull(supplier.registrationNumber),
          branchCode: trimOrNull(supplier.branchCode),
          address: buildPartyAddress(supplier),
          email: trimOrNull(supplier.email),
          phone: trimOrNull(supplier.phone),
        },
        customer: {
          legalName: trimOrNull(customer.legalName || customer.contactName),
          ruc: trimOrNull(customer.taxId),
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
          taxLabel: trimOrNull(context.compliance?.taxLabel) || "IGV",
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

    if (!trimOrNull(supplier.legalName)) errors.push("Supplier legal name is required for Peru SUNAT.");
    if (!trimOrNull(supplier.taxId)) errors.push("Supplier RUC is required for Peru SUNAT.");
    if (!trimOrNull(supplier.addressLine1)) errors.push("Supplier address line 1 is required for Peru SUNAT.");
    if (!trimOrNull(customer.legalName || customer.contactName)) errors.push("Customer legal name is required for Peru SUNAT.");
    if (!invoiceLines.length) errors.push("At least one invoice line is required for Peru SUNAT.");

    if (context.compliance?.buyerType === "B2B" && !trimOrNull(customer.taxId)) {
      warnings.push("Buyer RUC is missing for Peru B2B invoicing.");
    }
    if (!preparation.onboardingReady) {
      warnings.push(`Peru SUNAT onboarding is incomplete: ${(preparation.missingArtifacts || []).join(", ")}.`);
    } else if (!preparation.signingReady) {
      warnings.push(`Peru SUNAT signing prerequisites are incomplete: ${(preparation.missingArtifacts || []).join(", ")}.`);
    } else if (!preparation.transmissionReady) {
      warnings.push(`Peru SUNAT transmission prerequisites are incomplete: ${(preparation.missingArtifacts || []).join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Signed SUNAT UBL XML is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid && !context.transportDocument?.invoiceHash) {
      warnings.push("SUNAT ticket or CDR reference is not attached to this invoice yet.");
    }

    invoiceLines.forEach((line, index) => {
      if (!trimOrNull(line.classificationCode)) {
        warnings.push(`Line ${index + 1} is missing a classification code for Peru SUNAT.`);
      }
      if (!trimOrNull(line.taxCategory)) {
        warnings.push(`Line ${index + 1} is missing a Peru tax category.`);
      }
    });

    return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
  },
  buildWarnings(context) {
    const preparation = buildSunatSigningPreparation(context.connection);
    const warnings = [
      "Peru may require SUNAT electronic submission for invoices and related notes.",
      ...preparation.notes,
    ];
    if (!preparation.onboardingReady) {
      warnings.push(`Peru SUNAT onboarding is incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.signingReady) {
      warnings.push(`Peru SUNAT signing prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.transmissionReady) {
      warnings.push(`Peru SUNAT transmission prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!trimOrNull(context.business?.taxId)) {
      warnings.push("Supplier RUC should be completed before Peru SUNAT preparation.");
    }
    if (context.compliance?.buyerType === "B2B" && !trimOrNull(context.customer?.taxId)) {
      warnings.push("Buyer RUC should be completed before Peru B2B invoicing.");
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Attach the signed SUNAT UBL XML before enabling live SUNAT submission.");
    }
    return warnings;
  },
  async submit(payload, context) {
    return submitSunatDocument({
      connection: context.connection,
      payload,
    });
  },
  async getStatus(submissionId, context) {
    return getSunatSubmissionStatus({
      connection: context.connection,
      submissionId,
    });
  },
  async cancel(submissionId, context) {
    return cancelSunatDocument({
      connection: context.connection,
      submissionId,
    });
  },
};
