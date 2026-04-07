import { buildBaseValidationResult } from "@/lib/einvoicing/providers/base";
import {
  cancelMyInvoisDocument,
  getMyInvoisSubmissionStatus,
  submitMyInvoisDocument,
} from "@/lib/einvoicing/providers/myinvois-client";
import type { EInvoiceProviderAdapter } from "@/lib/einvoicing/types";

const DEFAULT_CLASSIFICATION_CODE = "022";
const DEFAULT_UNIT_CODE = "EA";
const STANDARD_INVOICE_TYPE_CODE = "01";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9]{8,20}$/;
const MALAYSIA_POSTAL_CODE_PATTERN = /^\d{5}$/;

const trimOrNull = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  return trimmed || null;
};

const inferTaxTypeCode = (context: Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]) => {
  const supplyType = context.compliance?.supplyType;
  const hasTax = Number(context.totals?.taxAmount || 0) > 0;
  if (!hasTax) return "06";
  if (supplyType === "GOODS") return "01";
  return "02";
};

const buildAddress = (party: NonNullable<Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]["business"]>) => ({
  line1: trimOrNull(party.addressLine1),
  line2: trimOrNull(party.addressLine2),
  city: trimOrNull(party.city),
  postalCode: trimOrNull(party.postalCode),
  countryCode: trimOrNull(party.country),
});

const buildSupplier = (context: Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]) => {
  const business = context.business || {};
  return {
    legalName: trimOrNull(business.legalName),
    tin: trimOrNull(business.taxId),
    registrationNumber: trimOrNull(business.registrationNumber),
    sstRegistrationNumber: trimOrNull(business.sstRegistrationNumber),
    email: trimOrNull(business.email),
    phone: trimOrNull(business.phone),
    address: buildAddress({
      addressLine1: business.addressLine1,
      addressLine2: business.addressLine2,
      city: business.city,
      postalCode: business.postalCode,
      country: context.sellerCountry || business.country,
    }),
  };
};

const buildBuyer = (context: Parameters<EInvoiceProviderAdapter["buildPayload"]>[0]) => {
  const customer = context.customer || {};
  return {
    legalName: trimOrNull(customer.legalName || customer.contactName),
    contactName: trimOrNull(customer.contactName),
    tin: trimOrNull(customer.taxId),
    registrationNumber: trimOrNull(customer.registrationNumber),
    email: trimOrNull(customer.email),
    phone: trimOrNull(customer.phone),
    address: buildAddress({
      addressLine1: customer.addressLine1,
      addressLine2: customer.addressLine2,
      city: customer.city,
      postalCode: customer.postalCode,
      country: context.buyerCountry || customer.country,
    }),
  };
};

export const myInvoisProvider: EInvoiceProviderAdapter = {
  key: "MYINVOIS",
  countries: ["MY"],
  documentFormat: "JSON",
  supportsClearance: true,
  buildPayload(context) {
    const taxTypeCode = inferTaxTypeCode(context);
    const supplier = buildSupplier(context);
    const buyer = buildBuyer(context);
    const lines = (context.items || []).map((item, index) => {
      const description = trimOrNull(item.description) || trimOrNull(item.name) || `Item ${index + 1}`;
      const lineTotal = Number(item.lineTotal ?? item.quantity * item.unitPrice);
      return {
        lineId: String(index + 1),
        description,
        classificationCode: DEFAULT_CLASSIFICATION_CODE,
        quantity: Number(item.quantity || 0),
        unitCode: DEFAULT_UNIT_CODE,
        unitPrice: Number(item.unitPrice || 0),
        lineExtensionAmount: lineTotal,
        tax: {
          typeCode: taxTypeCode,
          taxAmount: Number(item.taxAmount ?? 0),
        },
      };
    });

    return {
      externalId: trimOrNull(context.invoiceNumber) || trimOrNull(context.invoiceId) || "myinvois-draft",
      format: "JSON",
      payload: {
        profileId: "MYINVOIS",
        invoiceTypeCode: STANDARD_INVOICE_TYPE_CODE,
        invoiceNumber: trimOrNull(context.invoiceNumber),
        invoiceStatus: trimOrNull(context.invoiceStatus),
        issueDate: trimOrNull(context.issuedAt),
        dueDate: trimOrNull(context.dueDate),
        currencyCode: trimOrNull(context.currency),
        taxCurrencyCode: trimOrNull(context.currency),
        supplier,
        buyer,
        lines,
        totals: {
          subtotal: Number(context.totals?.subtotal || 0),
          taxAmount: Number(context.totals?.taxAmount || 0),
          discountAmount: Number(context.totals?.discountAmount || 0),
          payableAmount: Number(context.totals?.total || 0),
        },
      },
      warnings: [
        "MyInvois classification defaults to code 022 (Others) until line-item classification mapping is added.",
        "Supplier and buyer registration identifiers beyond TIN are not yet collected by the app.",
      ],
    };
  },
  validatePayload(payload, context) {
    const baseValidation = buildBaseValidationResult(payload, context);
    const errors = !baseValidation.ok ? [...baseValidation.errors] : [];
    const warnings = [...(baseValidation.ok ? baseValidation.warnings || [] : baseValidation.warnings || [])];
    const supplier = context.business;
    const buyer = context.customer;

    if (!trimOrNull(supplier?.legalName)) {
      errors.push("Supplier legal name is required for Malaysia e-invoicing.");
    }
    if (!trimOrNull(supplier?.taxId)) {
      errors.push("Supplier TIN is required for Malaysia e-invoicing.");
    }
    if (!trimOrNull(supplier?.addressLine1)) {
      errors.push("Supplier address line is required for Malaysia e-invoicing.");
    }
    if (!trimOrNull(supplier?.country)) {
      errors.push("Supplier country is required for Malaysia e-invoicing.");
    }
    if (!trimOrNull(buyer?.legalName || buyer?.contactName)) {
      errors.push("Buyer legal name is required for Malaysia e-invoicing.");
    }
    if (context.compliance?.buyerType === "B2B" && !trimOrNull(buyer?.taxId)) {
      errors.push("Buyer TIN is required for Malaysia B2B e-invoicing.");
    }
    if (!Array.isArray(context.items) || context.items.length === 0) {
      errors.push("At least one invoice line is required for Malaysia e-invoicing.");
    }

    const supplierEmail = trimOrNull(supplier?.email);
    if (supplierEmail && !EMAIL_PATTERN.test(supplierEmail)) {
      errors.push("Supplier email format is invalid for Malaysia e-invoicing.");
    }
    const buyerEmail = trimOrNull(buyer?.email);
    if (buyerEmail && !EMAIL_PATTERN.test(buyerEmail)) {
      errors.push("Buyer email format is invalid for Malaysia e-invoicing.");
    }

    const supplierPhone = trimOrNull(supplier?.phone);
    if (supplierPhone && !PHONE_PATTERN.test(supplierPhone)) {
      errors.push("Supplier phone must be 8-20 digits with optional leading + for Malaysia e-invoicing.");
    }
    const buyerPhone = trimOrNull(buyer?.phone);
    if (buyerPhone && !PHONE_PATTERN.test(buyerPhone)) {
      errors.push("Buyer phone must be 8-20 digits with optional leading + for Malaysia e-invoicing.");
    }

    if ((context.sellerCountry || supplier?.country) === "MY") {
      const postalCode = trimOrNull(supplier?.postalCode);
      if (postalCode && !MALAYSIA_POSTAL_CODE_PATTERN.test(postalCode)) {
        errors.push("Supplier postal code must be 5 digits for Malaysia e-invoicing.");
      }
    }
    if ((context.buyerCountry || buyer?.country) === "MY") {
      const postalCode = trimOrNull(buyer?.postalCode);
      if (postalCode && !MALAYSIA_POSTAL_CODE_PATTERN.test(postalCode)) {
        errors.push("Buyer postal code must be 5 digits for Malaysia e-invoicing.");
      }
    }

    if (!trimOrNull(supplier?.sstRegistrationNumber)) {
      warnings.push("Supplier SST registration number is not stored yet; submit only after confirming whether SST registration applies.");
    }
    if (!trimOrNull(supplier?.registrationNumber)) {
      warnings.push("Supplier registration number is not stored yet; MyInvois identity validation may need more identifiers.");
    }
    if (!trimOrNull(buyer?.registrationNumber) && context.compliance?.buyerType === "B2B") {
      warnings.push("Buyer registration number is not stored yet; B2B identity validation may need more identifiers.");
    }

    return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
  },
  buildWarnings(context) {
    const warnings = ["Malaysia may require MyInvois electronic invoicing for regulated transactions."];
    if (!trimOrNull(context.business?.taxId)) {
      warnings.push("Supplier TIN should be completed before Malaysia e-invoice submission.");
    }
    if (context.compliance?.buyerType === "B2B" && !trimOrNull(context.customer?.taxId)) {
      warnings.push("Buyer TIN should be completed before Malaysia B2B e-invoice submission.");
    }
    return warnings;
  },
  async submit(payload, context) {
    return submitMyInvoisDocument({
      connection: context.connection,
      payload,
    });
  },
  async getStatus(submissionId, context) {
    return getMyInvoisSubmissionStatus({
      connection: context.connection,
      submissionId,
    });
  },
  async cancel(submissionId, context) {
    return cancelMyInvoisDocument({
      connection: context.connection,
      submissionId,
    });
  },
};
