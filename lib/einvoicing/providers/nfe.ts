import { buildBaseValidationResult, createBasePayload } from "@/lib/einvoicing/providers/base";
import {
  buildNfeTransmissionPreparation,
  cancelNfeDocument,
  getNfeSubmissionStatus,
  submitNfeDocument,
} from "@/lib/einvoicing/providers/nfe-client";
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
  streetName: trimOrNull(party.addressLine1),
  additionalStreetName: trimOrNull(party.addressLine2),
  cityName: trimOrNull(party.city),
  countrySubentity: trimOrNull(party.state),
  postalZone: trimOrNull(party.postalCode),
  countryIdentificationCode: trimOrNull(party.country),
});

const buildBrazilLine = (
  context: Parameters<EInvoiceProviderAdapter["buildPayload"]>[0],
  index: number,
  item: NonNullable<Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]["items"]>[number]
) => {
  const lineTotal = Number(item.lineTotal ?? item.quantity * item.unitPrice);
  const description = trimOrNull(item.description) || trimOrNull(item.name) || `Item ${index + 1}`;

  return {
    lineNumber: String(index + 1),
    description,
    quantity: Number(item.quantity || 0),
    unitPrice: Number(item.unitPrice || 0),
    lineTotal,
    unitCode: trimOrNull(item.unitCode) || "UN",
    classificationCode: trimOrNull(item.classificationCode),
    taxCategory: trimOrNull(item.taxCategory),
    taxExemptionReason: trimOrNull(item.taxExemptionReason),
    incomeClassification: trimOrNull(item.incomeClassification),
    taxAmount: Number(item.taxAmount ?? 0),
    buyerType: trimOrNull(context.compliance?.buyerType),
    supplyType: trimOrNull(context.compliance?.supplyType),
  };
};

export const nfeProvider: EInvoiceProviderAdapter = {
  key: "BR_NFE",
  countries: ["BR"],
  documentFormat: "UBL_XML",
  supportsClearance: true,
  buildPayload(context) {
    const base = createBasePayload(context, "BR_NFE", "UBL_XML");
    const supplier = context.business || {};
    const customer = context.customer || {};
    const prep = buildNfeTransmissionPreparation(context.connection);
    const warnings = [...base.warnings, ...prep.notes];

    if (!trimOrNull(supplier.legalName)) {
      warnings.push("Supplier legal name is missing; Brazil NF-e issuer data will be incomplete.");
    }
    if (!trimOrNull(supplier.taxId)) {
      warnings.push("Supplier CNPJ is missing; Brazil NF-e issuer data will be incomplete.");
    }
    if (!trimOrNull(supplier.addressLine1)) {
      warnings.push("Supplier address line is missing; Brazilian issuer address will be partial.");
    }
    if (!trimOrNull(supplier.state)) {
      warnings.push("Supplier UF is missing; Brazil NF-e state routing may be incomplete.");
    }
    if (!trimOrNull(customer.legalName || customer.contactName)) {
      warnings.push("Buyer legal name is missing; Brazil NF-e recipient data will be incomplete.");
    }
    if (!Array.isArray(context.items) || context.items.length === 0) {
      warnings.push("Brazil NF-e payload needs at least one invoice line.");
    }
    if (!prep.liveSubmissionReady && prep.liveSubmissionBlockedReason) {
      warnings.push(prep.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Signed NF-e XML is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid && !context.transportDocument?.invoiceHash) {
      warnings.push("NF-e access key or UUID is not attached to this invoice yet.");
    }

    (context.items || []).forEach((item, index) => {
      if (!trimOrNull(item.unitCode)) {
        warnings.push(`Line ${index + 1} is missing a unit code and will default to UN.`);
      }
      if (!trimOrNull(item.classificationCode)) {
        warnings.push(`Line ${index + 1} is missing a product/service classification code.`);
      }
      if (!trimOrNull(item.taxCategory)) {
        warnings.push(`Line ${index + 1} is missing a Brazil tax category mapping.`);
      }
    });

    return {
      externalId: base.externalId,
      format: "UBL_XML",
      payload: {
        providerKey: "BR_NFE",
        documentType: "NF-e",
        invoiceNumber: trimOrNull(context.invoiceNumber),
        invoiceStatus: trimOrNull(context.invoiceStatus),
        issueDate: trimOrNull(context.issuedAt),
        dueDate: trimOrNull(context.dueDate),
        currencyCode: trimOrNull(context.currency),
        sellerCountry: trimOrNull(context.sellerCountry),
        buyerCountry: trimOrNull(context.buyerCountry),
        transportPreparation: prep,
        transportDocument: context.transportDocument || null,
        supplier: {
          legalName: trimOrNull(supplier.legalName),
          cnpj: trimOrNull(supplier.taxId),
          registrationNumber: trimOrNull(supplier.registrationNumber),
          branchCode: trimOrNull(supplier.branchCode),
          uf: trimOrNull(supplier.state),
          address: buildPartyAddress(supplier),
          email: trimOrNull(supplier.email),
          phone: trimOrNull(supplier.phone),
        },
        customer: {
          legalName: trimOrNull(customer.legalName || customer.contactName),
          cnpj: trimOrNull(customer.taxId),
          registrationNumber: trimOrNull(customer.registrationNumber),
          branchCode: trimOrNull(customer.branchCode),
          address: buildPartyAddress(customer),
          email: trimOrNull(customer.email),
          phone: trimOrNull(customer.phone),
        },
        invoiceLines: (context.items || []).map((item, index) => buildBrazilLine(context, index, item)),
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
          taxLabel: trimOrNull(context.compliance?.taxLabel) || "Tax",
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
    const prep = buildNfeTransmissionPreparation(context.connection);

    if (!trimOrNull(supplier.legalName)) errors.push("Supplier legal name is required for Brazil NF-e.");
    if (!trimOrNull(supplier.taxId)) errors.push("Supplier CNPJ is required for Brazil NF-e.");
    if (!trimOrNull(supplier.addressLine1)) errors.push("Supplier address line 1 is required for Brazil NF-e.");
    if (!trimOrNull(supplier.city)) errors.push("Supplier city is required for Brazil NF-e.");
    if (!trimOrNull(supplier.state)) errors.push("Supplier UF is required for Brazil NF-e.");
    if (!trimOrNull(supplier.postalCode)) warnings.push("Supplier postal code is missing and may be required for state-specific NF-e mapping.");
    if (!trimOrNull(customer.legalName || customer.contactName)) errors.push("Buyer legal name is required for Brazil NF-e.");
    if (!Array.isArray(context.items) || context.items.length === 0) errors.push("At least one invoice line is required for Brazil NF-e.");

    if (context.compliance?.buyerType === "B2B" && !trimOrNull(customer.taxId)) {
      warnings.push("Buyer CNPJ/CPF is missing for a Brazil B2B invoice.");
    }
    if (!prep.onboardingReady) {
      warnings.push(`Brazil NF-e onboarding prerequisites are incomplete: ${prep.missingArtifacts.join(", ")}.`);
    } else if (!prep.signingReady) {
      warnings.push(`Brazil NF-e signing prerequisites are incomplete: ${prep.missingArtifacts.join(", ")}.`);
    }
    if (!prep.liveSubmissionReady && prep.liveSubmissionBlockedReason) {
      warnings.push(prep.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Signed NF-e XML is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid && !context.transportDocument?.invoiceHash) {
      warnings.push("NF-e access key or UUID is not attached to this invoice yet.");
    }

    (context.items || []).forEach((item, index) => {
      if (!trimOrNull(item.unitCode)) {
        warnings.push(`Line ${index + 1} is missing a unit code and will default to UN.`);
      }
      if (!trimOrNull(item.classificationCode)) {
        warnings.push(`Line ${index + 1} is missing a product/service classification code.`);
      }
      if (!trimOrNull(item.taxCategory)) {
        warnings.push(`Line ${index + 1} is missing a Brazil tax category mapping.`);
      }
    });

    return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
  },
  buildWarnings(context) {
    const prep = buildNfeTransmissionPreparation(context.connection);
    const warnings = [
      "Brazil may require NF-e submission in addition to the human-readable invoice.",
      ...prep.notes,
    ];
    if (!prep.onboardingReady) {
      warnings.push(`Brazil NF-e onboarding is incomplete: ${prep.missingArtifacts.join(", ")}.`);
    }
    if (!prep.signingReady) {
      warnings.push(`Brazil NF-e signing is incomplete: ${prep.missingArtifacts.join(", ")}.`);
    }
    if (!prep.liveSubmissionReady && prep.liveSubmissionBlockedReason) {
      warnings.push(prep.liveSubmissionBlockedReason);
    }
    if (!trimOrNull(context.business?.taxId)) {
      warnings.push("Supplier CNPJ should be completed before Brazil NF-e submission.");
    }
    if (context.compliance?.buyerType === "B2B" && !trimOrNull(context.customer?.taxId)) {
      warnings.push("Buyer CNPJ/CPF should be completed before Brazil B2B invoicing.");
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Attach the signed NF-e XML before enabling live SEFAZ submission.");
    }
    return warnings;
  },
  async submit(payload, context) {
    return submitNfeDocument({
      connection: context.connection,
      payload,
    });
  },
  async getStatus(submissionId, context) {
    return getNfeSubmissionStatus({
      connection: context.connection,
      submissionId,
    });
  },
  async cancel(submissionId, context) {
    return cancelNfeDocument({
      connection: context.connection,
      submissionId,
    });
  },
};
