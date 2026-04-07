import { buildBaseValidationResult } from "@/lib/einvoicing/providers/base";
import {
  buildMdEFacturaPreparation,
  cancelMdEFacturaDocument,
  getMdEFacturaStatus,
  submitMdEFacturaDocument,
} from "@/lib/einvoicing/providers/md-efactura-client";
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
    unitCode: trimOrNull(item.unitCode) || "EA",
    classificationCode: trimOrNull(item.classificationCode),
    taxCategory: trimOrNull(item.taxCategory) || "VAT",
    taxAmount: Number(item.taxAmount ?? 0),
    taxExemptionReason: trimOrNull(item.taxExemptionReason),
    incomeClassification: trimOrNull(item.incomeClassification),
  };
};

export const mdEFacturaProvider: EInvoiceProviderAdapter = {
  key: "MD_EFACTURA",
  countries: ["MD"],
  documentFormat: "UBL_XML",
  supportsClearance: true,
  buildPayload(context) {
    const preparation = buildMdEFacturaPreparation(context.connection);
    const supplier = context.business || {};
    const customer = context.customer || {};
    const invoiceLines = (context.items || []).map((item, index) => buildLine(item, index));
    const warnings = [
      "Moldova e-Factura payload is structured for readiness and validation and can be submitted when a Moldova endpoint is configured.",
      ...preparation.notes,
    ];

    if (!trimOrNull(supplier.legalName)) warnings.push("Supplier legal name is missing for Moldova e-Factura.");
    if (!trimOrNull(supplier.taxId)) warnings.push("Supplier taxpayer code is missing for Moldova e-Factura.");
    if (!trimOrNull(supplier.addressLine1)) warnings.push("Supplier address line 1 is missing for Moldova e-Factura.");
    if (!trimOrNull(customer.legalName || customer.contactName)) warnings.push("Customer legal name is missing for Moldova e-Factura.");
    if (context.compliance?.buyerType === "B2B" && !trimOrNull(customer.taxId)) {
      warnings.push("Buyer taxpayer code is missing for a Moldova B2B invoice.");
    }
    if (!invoiceLines.length) warnings.push("Moldova e-Factura payload needs at least one invoice line.");
    if (!preparation.onboardingReady) {
      warnings.push(`Moldova e-Factura onboarding is incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.signingReady) {
      warnings.push(`Moldova e-Factura signing prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.transmissionReady) {
      warnings.push(`Moldova e-Factura transmission prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Signed Moldova e-Factura XML is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid && !context.transportDocument?.invoiceHash) {
      warnings.push("Moldova submission identifier is not attached to this invoice yet.");
    }

    return {
      externalId: trimOrNull(context.invoiceNumber) || trimOrNull(context.invoiceId) || "md-efactura-draft",
      format: "UBL_XML",
      payload: {
        documentProfile: "MD_EFACTURA",
        documentType: "MOLDOVA_EFACTURA",
        invoiceNumber: trimOrNull(context.invoiceNumber),
        invoiceStatus: trimOrNull(context.invoiceStatus),
        issueDate: trimOrNull(context.issuedAt),
        dueDate: trimOrNull(context.dueDate),
        currencyCode: trimOrNull(context.currency),
        transportPreparation: preparation,
        transportDocument: context.transportDocument || null,
        supplier: {
          legalName: trimOrNull(supplier.legalName),
          taxpayerCode: trimOrNull(supplier.taxId),
          registrationNumber: trimOrNull(supplier.registrationNumber),
          branchCode: trimOrNull(supplier.branchCode),
          address: buildPartyAddress(supplier),
          email: trimOrNull(supplier.email),
          phone: trimOrNull(supplier.phone),
        },
        customer: {
          legalName: trimOrNull(customer.legalName || customer.contactName),
          taxpayerCode: trimOrNull(customer.taxId),
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

    if (!trimOrNull(supplier.legalName)) errors.push("Supplier legal name is required for Moldova e-Factura.");
    if (!trimOrNull(supplier.taxId)) errors.push("Supplier taxpayer code is required for Moldova e-Factura.");
    if (!trimOrNull(supplier.addressLine1)) errors.push("Supplier address line 1 is required for Moldova e-Factura.");
    if (!trimOrNull(customer.legalName || customer.contactName)) errors.push("Customer legal name is required for Moldova e-Factura.");
    if (!invoiceLines.length) errors.push("At least one invoice line is required for Moldova e-Factura.");

    if (context.compliance?.buyerType === "B2B" && !trimOrNull(customer.taxId)) {
      warnings.push("Buyer taxpayer code is missing for Moldova B2B invoicing.");
    }
    if (!preparation.onboardingReady) {
      warnings.push(`Moldova e-Factura onboarding is incomplete: ${(preparation.missingArtifacts || []).join(", ")}.`);
    } else if (!preparation.signingReady) {
      warnings.push(`Moldova e-Factura signing prerequisites are incomplete: ${(preparation.missingArtifacts || []).join(", ")}.`);
    } else if (!preparation.transmissionReady) {
      warnings.push(`Moldova e-Factura transmission prerequisites are incomplete: ${(preparation.missingArtifacts || []).join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Signed Moldova e-Factura XML is not attached to this invoice yet.");
    }
    if (!context.transportDocument?.uuid && !context.transportDocument?.invoiceHash) {
      warnings.push("Moldova submission identifier is not attached to this invoice yet.");
    }

    invoiceLines.forEach((line, index) => {
      if (!trimOrNull(line.classificationCode)) {
        warnings.push(`Line ${index + 1} is missing a classification code for Moldova e-Factura.`);
      }
      if (!trimOrNull(line.taxCategory)) {
        warnings.push(`Line ${index + 1} is missing a Moldova tax category.`);
      }
    });

    return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
  },
  buildWarnings(context) {
    const preparation = buildMdEFacturaPreparation(context.connection);
    const warnings = [
      "Moldova may require e-Factura submission or platform exchange in addition to the PDF invoice.",
      ...preparation.notes,
    ];
    if (!preparation.onboardingReady) {
      warnings.push(`Moldova e-Factura onboarding is incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.signingReady) {
      warnings.push(`Moldova e-Factura signing prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    } else if (!preparation.transmissionReady) {
      warnings.push(`Moldova e-Factura transmission prerequisites are incomplete: ${preparation.missingArtifacts.join(", ")}.`);
    }
    if (!preparation.liveSubmissionReady && preparation.liveSubmissionBlockedReason) {
      warnings.push(preparation.liveSubmissionBlockedReason);
    }
    if (!trimOrNull(context.business?.taxId)) {
      warnings.push("Supplier taxpayer code should be completed before Moldova e-Factura preparation.");
    }
    if (context.compliance?.buyerType === "B2B" && !trimOrNull(context.customer?.taxId)) {
      warnings.push("Buyer taxpayer code should be completed before Moldova B2B invoicing.");
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Attach the signed Moldova e-Factura XML before enabling live Moldova submission.");
    }
    return warnings;
  },
  async submit(payload, context) {
    return submitMdEFacturaDocument({
      connection: context.connection,
      payload,
    });
  },
  async getStatus(submissionId, context) {
    return getMdEFacturaStatus({
      connection: context.connection,
      submissionId,
    });
  },
  async cancel(submissionId, context) {
    return cancelMdEFacturaDocument({
      connection: context.connection,
      submissionId,
    });
  },
};
