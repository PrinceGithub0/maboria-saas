import { buildBaseValidationResult, createBasePayload } from "@/lib/einvoicing/providers/base";
import {
  getZatcaSubmissionStatus,
  buildZatcaTransportPreparation,
  cancelZatcaInvoice,
  submitZatcaInvoice,
} from "@/lib/einvoicing/providers/zatca-client";
import type { EInvoiceProviderAdapter } from "@/lib/einvoicing/types";

const trimOrNull = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const buildPartyAddress = (party: NonNullable<Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]["business"]>) => ({
  line1: trimOrNull(party.addressLine1),
  line2: trimOrNull(party.addressLine2),
  city: trimOrNull(party.city),
  state: trimOrNull(party.state),
  postalCode: trimOrNull(party.postalCode),
  country: trimOrNull(party.country),
});

export const zatcaProvider: EInvoiceProviderAdapter = {
  key: "ZATCA",
  countries: ["SA"],
  documentFormat: "UBL_XML",
  supportsClearance: true,
  buildPayload(context) {
    const result = createBasePayload(context, "ZATCA", "UBL_XML");
    const transport = buildZatcaTransportPreparation(context.connection);
    const warnings = [
      ...result.warnings,
      ...transport.notes,
    ];
    if (!transport.onboardingReady) {
      warnings.push(`ZATCA onboarding prerequisites are incomplete: ${transport.missingArtifacts.join(", ")}.`);
    } else if (!transport.clearanceReady) {
      warnings.push(`ZATCA clearance artifacts are incomplete: ${transport.missingArtifacts.join(", ")}.`);
    }
    if (!transport.operationalReady) {
      warnings.push("ZATCA operational readiness still depends on onboarding and signing artifacts.");
    }
    if (!transport.liveSubmissionReady && transport.liveSubmissionBlockedReason) {
      warnings.push(transport.liveSubmissionBlockedReason);
    }

    const business = context.business || {};
    const customer = context.customer || {};

    if (!trimOrNull(business.legalName)) {
      warnings.push("Supplier legal name is missing; ZATCA supplier party will be incomplete.");
    }
    if (!trimOrNull(business.taxId)) {
      warnings.push("Supplier TIN is missing; ZATCA onboarding and signing cannot be completed.");
    }
    if (!trimOrNull(business.addressLine1)) {
      warnings.push("Supplier address line is missing; the Saudi payload will be incomplete.");
    }
    if (!trimOrNull(customer.legalName || customer.contactName)) {
      warnings.push("Customer legal name is missing; ZATCA buyer party will be incomplete.");
    }
    if (context.compliance?.buyerType === "B2B" && !trimOrNull(customer.taxId)) {
      warnings.push("Buyer TIN is missing for a Saudi B2B invoice.");
    }

    return {
      ...result,
      payload: {
        ...result.payload,
        submissionMode: context.compliance?.buyerType === "B2B" ? "CLEARANCE" : "REPORTING",
        transportPreparation: {
          sandbox: transport.sandbox,
          onboardingReady: transport.onboardingReady,
          clearanceReady: transport.clearanceReady,
          operationalReady: transport.operationalReady,
          liveSubmissionReady: transport.liveSubmissionReady,
          liveSubmissionBlockedReason: transport.liveSubmissionBlockedReason,
          missingArtifacts: transport.missingArtifacts,
          nextActions: transport.nextActions,
        },
        transportDocument: context.transportDocument || null,
        supplier: {
          legalName: trimOrNull(business.legalName),
          taxId: trimOrNull(business.taxId),
          registrationNumber: trimOrNull(business.registrationNumber),
          branchCode: trimOrNull(business.branchCode),
          address: buildPartyAddress(business),
        },
        customer: {
          legalName: trimOrNull(customer.legalName || customer.contactName),
          taxId: trimOrNull(customer.taxId),
          registrationNumber: trimOrNull(customer.registrationNumber),
          branchCode: trimOrNull(customer.branchCode),
          address: buildPartyAddress(customer),
        },
        invoiceLines: (context.items || []).map((item, index) => ({
          lineNumber: index + 1,
          description: trimOrNull(item.description || item.name),
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          lineTotal: Number(item.lineTotal ?? item.quantity * item.unitPrice),
          unitCode: trimOrNull(item.unitCode),
          classificationCode: trimOrNull(item.classificationCode),
          taxCategory: trimOrNull(item.taxCategory),
          taxExemptionReason: trimOrNull(item.taxExemptionReason),
          incomeClassification: trimOrNull(item.incomeClassification),
          taxAmount: Number(item.taxAmount ?? 0),
        })),
      },
      warnings,
    };
  },
  validatePayload(payload, context) {
    const baseValidation = buildBaseValidationResult(payload, context);
    const errors = !baseValidation.ok ? [...baseValidation.errors] : [];
    const warnings = [...(baseValidation.warnings || [])];
    const transport = buildZatcaTransportPreparation(context.connection);
    const supplier = context.business || {};
    const customer = context.customer || {};
    const transportDocument = context.transportDocument || null;

    if (!trimOrNull(supplier.legalName)) {
      errors.push("Supplier legal name is required for Saudi ZATCA invoices.");
    }
    if (!trimOrNull(supplier.taxId)) {
      errors.push("Supplier TIN is required for Saudi ZATCA onboarding and submission prep.");
    }
    if (!trimOrNull(supplier.addressLine1)) {
      errors.push("Supplier address line 1 is required for Saudi ZATCA invoices.");
    }
    if (!trimOrNull(supplier.city)) {
      warnings.push("Supplier city is missing; the Saudi payload may be incomplete.");
    }
    if (!trimOrNull(customer.legalName || customer.contactName)) {
      errors.push("Customer legal name is required for Saudi ZATCA invoices.");
    }
    if (context.compliance?.buyerType === "B2B" && !trimOrNull(customer.taxId)) {
      errors.push("Buyer TIN is required for Saudi B2B invoices.");
    }
    if (!Array.isArray(context.items) || context.items.length === 0) {
      errors.push("At least one invoice line is required for Saudi ZATCA invoices.");
    }

    if (!transport.onboardingReady) {
      errors.push(`ZATCA onboarding prerequisites are incomplete: ${transport.missingArtifacts.join(", ")}.`);
    } else if (!transport.clearanceReady) {
      warnings.push(`ZATCA clearance artifacts are incomplete: ${transport.missingArtifacts.join(", ")}.`);
    }
    if (!transport.operationalReady) {
      warnings.push("ZATCA submission remains blocked until onboarding artifacts and production identifiers are complete.");
    }
    if (!transport.liveSubmissionReady && transport.liveSubmissionBlockedReason) {
      warnings.push(transport.liveSubmissionBlockedReason);
    }
    if (!transportDocument?.documentBase64) {
      warnings.push("Signed ZATCA invoice XML is not attached to this invoice yet.");
    }
    if (!transportDocument?.invoiceHash) {
      warnings.push("ZATCA invoice hash is not attached to this invoice yet.");
    }
    if (!transportDocument?.uuid) {
      warnings.push("ZATCA invoice UUID is not attached to this invoice yet.");
    }

    (context.items || []).forEach((item, index) => {
      const lineNumber = index + 1;
      if (!trimOrNull(item.unitCode)) {
        warnings.push(`Line ${lineNumber} is missing a unit code and will need Saudi mapping.`);
      }
      if (!trimOrNull(item.classificationCode)) {
        warnings.push(`Line ${lineNumber} is missing a product/service classification code.`);
      }
      if (!trimOrNull(item.taxCategory)) {
        warnings.push(`Line ${lineNumber} is missing a Saudi tax category.`);
      }
      if (Number(item.taxAmount ?? 0) <= 0 && !trimOrNull(item.taxExemptionReason)) {
        warnings.push(`Line ${lineNumber} has no tax amount and should carry a tax exemption reason if exempt.`);
      }
    });

    return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
  },
  buildWarnings(context) {
    const transport = buildZatcaTransportPreparation(context.connection);
    const warnings = [
      "Saudi Arabia may require ZATCA-compliant e-invoicing and clearance in addition to the PDF invoice.",
      ...transport.notes,
    ];
    if (!transport.onboardingReady) {
      warnings.push(`ZATCA onboarding is incomplete: ${transport.missingArtifacts.join(", ")}.`);
    } else if (!transport.clearanceReady) {
      warnings.push(`ZATCA clearance artifacts are incomplete: ${transport.missingArtifacts.join(", ")}.`);
    }
    if (!transport.operationalReady) {
      warnings.push("ZATCA submission is blocked until onboarding, signing, and operational artifacts are complete.");
    }
    if (!transport.liveSubmissionReady && transport.liveSubmissionBlockedReason) {
      warnings.push(transport.liveSubmissionBlockedReason);
    }
    if (!context.transportDocument?.documentBase64) {
      warnings.push("Attach the signed Saudi invoice XML before any live ZATCA submission.");
    }
    return warnings;
  },
  async submit(payload, context) {
    return submitZatcaInvoice({
      connection: context.connection,
      payload,
    });
  },
  async getStatus(submissionId, context) {
    return getZatcaSubmissionStatus({
      connection: context.connection,
      submissionId,
    });
  },
  async cancel(submissionId, context) {
    return cancelZatcaInvoice({
      connection: context.connection,
      submissionId,
    });
  },
};
