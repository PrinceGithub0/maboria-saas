import { buildBaseValidationResult } from "@/lib/einvoicing/providers/base";
import {
  buildSdiTransmissionPreparation,
  cancelSdiDocument,
  getSdiSubmissionStatus,
  submitSdiDocument,
} from "@/lib/einvoicing/providers/sdi-client";
import type { EInvoiceProviderAdapter } from "@/lib/einvoicing/types";

const trimOrNull = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const buildAddress = (party: {
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
  province: trimOrNull(party.state),
  postalCode: trimOrNull(party.postalCode),
  countryCode: trimOrNull(party.country),
});

const buildParty = (
  party: NonNullable<Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]["business"]>,
  fallbackCountry?: string | null
) => ({
  legalName: trimOrNull(party.legalName),
  vatNumber: trimOrNull(party.taxId),
  registrationNumber: trimOrNull(party.registrationNumber),
  branchCode: trimOrNull(party.branchCode),
  recipientCode: trimOrNull(party.branchCode || party.registrationNumber),
  pecEmail: trimOrNull(party.email),
  address: buildAddress({
    addressLine1: party.addressLine1,
    addressLine2: party.addressLine2,
    city: party.city,
    state: party.state,
    postalCode: party.postalCode,
    country: party.country || fallbackCountry,
  }),
  contact: {
    email: trimOrNull(party.email),
    phone: trimOrNull(party.phone),
  },
});

const buildLine = (
  item: NonNullable<Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]["items"]>[number],
  index: number
) => {
  const lineTotal = Number(item.lineTotal ?? item.quantity * item.unitPrice);
  return {
    lineNumber: index + 1,
    description: trimOrNull(item.description || item.name) || `Item ${index + 1}`,
    quantity: Number(item.quantity || 0),
    unitPrice: Number(item.unitPrice || 0),
    lineTotal,
    unitCode: trimOrNull(item.unitCode) || "EA",
    classificationCode: trimOrNull(item.classificationCode),
    taxCategory: trimOrNull(item.taxCategory) || null,
    taxAmount: Number(item.taxAmount ?? 0),
    taxExemptionReason: trimOrNull(item.taxExemptionReason),
    incomeClassification: trimOrNull(item.incomeClassification),
  };
};

export const sdiProvider: EInvoiceProviderAdapter = {
  key: "IT_SDI",
  countries: ["IT"],
  documentFormat: "UBL_XML",
  supportsClearance: true,
  buildPayload(context) {
    const preparation = buildSdiTransmissionPreparation(context.connection);
    const supplier = context.business || {};
    const customer = context.customer || {};
    const invoiceLines = (context.items || []).map((item, index) => buildLine(item, index));

    const warnings = [
      "Italy SdI payload is shaped for FatturaPA-style transmission preparation and can be submitted when an accredited endpoint is configured.",
      ...preparation.notes,
    ];

    if (!trimOrNull(supplier.legalName)) warnings.push("Supplier legal name is missing for Italy SdI.");
    if (!trimOrNull(supplier.taxId)) warnings.push("Supplier VAT number is missing for Italy SdI.");
    if (!trimOrNull(customer.legalName || customer.contactName)) warnings.push("Customer legal name is missing for Italy SdI.");
    if (!invoiceLines.length) warnings.push("Italy SdI payload needs at least one invoice line.");
    if (!preparation.onboardingReady) {
      warnings.push(`Italy SdI onboarding is incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.transmissionReady) {
      warnings.push(`Italy SdI transmission credentials are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Signed FatturaPA XML is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid) {
      warnings.push("SdI transmission identifier or UUID is not attached to this invoice yet.");
    }

    return {
      externalId: trimOrNull(context.invoiceNumber) || trimOrNull(context.invoiceId) || "sdi-draft",
      format: "UBL_XML",
      payload: {
        documentProfile: "IT_SDI",
        invoiceNumber: trimOrNull(context.invoiceNumber),
        invoiceStatus: trimOrNull(context.invoiceStatus),
        issueDate: trimOrNull(context.issuedAt),
        dueDate: trimOrNull(context.dueDate),
        currencyCode: trimOrNull(context.currency),
        transmissionPreparation: preparation,
        transportDocument: context.transportDocument || null,
        supplier: buildParty(supplier, context.sellerCountry),
        customer: {
          ...buildParty(customer, context.buyerCountry),
          recipientCode: trimOrNull(customer.branchCode || customer.registrationNumber),
          pecEmail: trimOrNull(customer.email),
        },
        invoiceLines,
        totals: {
          subtotal: Number(context.totals?.subtotal || 0),
          taxAmount: Number(context.totals?.taxAmount || 0),
          discountAmount: Number(context.totals?.discountAmount || 0),
          total: Number(context.totals?.total || 0),
        },
      },
      warnings,
    };
  },
  validatePayload(payload, context) {
    const baseValidation = buildBaseValidationResult(payload, context);
    const errors = !baseValidation.ok ? [...baseValidation.errors] : [];
    const warnings = [...(baseValidation.ok ? baseValidation.warnings || [] : baseValidation.warnings || [])];
    const structuredPayload = payload.payload as Record<string, unknown> | null;
    const supplier = context.business || {};
    const customer = context.customer || {};
    const transmissionPreparation = (structuredPayload?.transmissionPreparation || {}) as {
      onboardingReady?: boolean;
      transmissionReady?: boolean;
      missingArtifacts?: string[];
    };
    const invoiceLines = Array.isArray(structuredPayload?.invoiceLines)
      ? (structuredPayload?.invoiceLines as Array<{ lineNumber?: number; classificationCode?: string | null; taxCategory?: string | null }>)
      : [];

    if (!trimOrNull(supplier.legalName)) errors.push("Supplier legal name is required for Italy SdI.");
    if (!trimOrNull(supplier.taxId)) errors.push("Supplier VAT number is required for Italy SdI.");
    if (!trimOrNull(supplier.addressLine1)) warnings.push("Supplier address line 1 is missing and may be needed for Italy SdI transmission.");
    if (!trimOrNull(customer.legalName || customer.contactName)) errors.push("Customer legal name is required for Italy SdI.");
    if (!invoiceLines.length) errors.push("At least one invoice line is required for Italy SdI.");

    if (context.compliance?.buyerType === "B2B" && !trimOrNull(customer.branchCode || customer.registrationNumber) && !trimOrNull(customer.email)) {
      warnings.push("Italy B2B routing is missing both recipient code and PEC email.");
    }

    if (!transmissionPreparation.onboardingReady) {
      warnings.push(`Italy SdI onboarding is incomplete: ${(transmissionPreparation.missingArtifacts || []).join(", ")}.`);
    }
    if (transmissionPreparation.onboardingReady && !transmissionPreparation.transmissionReady) {
      warnings.push(`Italy SdI transmission credentials are incomplete: ${(transmissionPreparation.missingArtifacts || []).join(", ")}.`);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Signed FatturaPA XML is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid) {
      warnings.push("SdI transmission identifier or UUID is not attached to this invoice yet.");
    }

    invoiceLines.forEach((line, index) => {
      if (!trimOrNull(line.classificationCode)) {
        warnings.push(`Line ${index + 1} is missing a classification code for Italy SdI.`);
      }
      if (!trimOrNull(line.taxCategory)) {
        warnings.push(`Line ${index + 1} is missing a tax category for Italy SdI.`);
      }
    });

    return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
  },
  buildWarnings(context) {
    const preparation = buildSdiTransmissionPreparation(context.connection);
    const warnings = [
      "Italy may require SdI compliant structured transmission in addition to the human-readable invoice.",
      ...preparation.notes,
    ];

    if (!preparation.onboardingReady) {
      warnings.push(`Italy SdI onboarding is incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.transmissionReady) {
      warnings.push(`Italy SdI transmission credentials are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Attach the signed FatturaPA XML before enabling live SdI transmission.");
    }

    return warnings;
  },
  async submit(payload, context) {
    return submitSdiDocument({
      connection: context.connection,
      payload,
    });
  },
  async getStatus(submissionId, context) {
    return getSdiSubmissionStatus({
      connection: context.connection,
      submissionId,
    });
  },
  async cancel(submissionId, context) {
    return cancelSdiDocument({
      connection: context.connection,
      submissionId,
    });
  },
};
