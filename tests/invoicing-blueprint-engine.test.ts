import assert from "node:assert/strict";

import { countryCodes } from "@/lib/countries";
import {
  listCountryComplianceModules,
  listSpecializedCountryComplianceModules,
  resolveCountryComplianceModule,
} from "@/lib/invoicing/blueprint/registry";
import {
  buildUniversalInvoiceDocument,
  validateUniversalInvoiceDocument,
} from "@/lib/invoicing/blueprint/validation";
import { getBlueprintValidationBlockingReason } from "@/lib/invoicing/blueprint/blocking";

const modules = listCountryComplianceModules();
assert.equal(
  modules.length,
  countryCodes.length,
  "every supported country code should resolve to a blueprint compliance module"
);

const germanyModule = resolveCountryComplianceModule("DE");
assert.ok(germanyModule, "Germany should resolve to a blueprint compliance module");
assert.equal(germanyModule?.implementationType, "SPECIALIZED");

const specializedModules = listSpecializedCountryComplianceModules();
assert.deepEqual(
  specializedModules.map((module) => module.countryCode).sort(),
  ["BR", "DE", "GB", "GR", "IT", "MX", "MY", "RO", "SA", "US"],
  "priority countries should now resolve through explicit compliance modules"
);

const missingBuyerTaxIdDocument = buildUniversalInvoiceDocument({
  invoiceNumber: "INV-DE-001",
  issueDate: "2026-04-06T00:00:00.000Z",
  dueDate: "2026-04-20T00:00:00.000Z",
  currency: "EUR",
  supplier: {
    legalName: "Maboria GmbH",
    taxId: "DE123456789",
    addressLine1: "Unter den Linden 1",
    city: "Berlin",
    postalCode: "10117",
    countryCode: "DE",
  },
  customer: {
    legalName: "Acme France SARL",
    addressLine1: "10 Rue Example",
    city: "Paris",
    postalCode: "75001",
    countryCode: "FR",
    classification: "BUSINESS",
  },
  buyerType: "B2B",
  supplyType: "SERVICES",
  lines: [
    {
      description: "Annual SaaS subscription",
      quantity: 1,
      unitPrice: 1000,
      lineTotal: 1000,
    },
  ],
  totals: {
    subtotal: 1000,
    taxTotal: 0,
    discountTotal: 0,
    grandTotal: 1000,
  },
});

const germanyValidation = validateUniversalInvoiceDocument(missingBuyerTaxIdDocument);
assert.equal(germanyValidation.ok, false);
assert.ok(
  germanyValidation.issues.some((issue) => issue.code === "COUNTRY_BUYER_TAX_ID_REQUIRED"),
  "B2B Germany invoices should require buyer tax details"
);
assert.ok(
  germanyValidation.issues.some((issue) => issue.code === "COUNTRY_MANUAL_REVIEW_REQUIRED"),
  "cross-border compliance should emit structured manual-review issues"
);
assert.match(
  String(getBlueprintValidationBlockingReason(germanyValidation)),
  /VAT|tax/i
);

const malaysiaDocument = buildUniversalInvoiceDocument({
  invoiceNumber: "INV-MY-001",
  issueDate: "2026-04-06T00:00:00.000Z",
  dueDate: "2026-04-20T00:00:00.000Z",
  currency: "MYR",
  supplier: {
    legalName: "Maboria Labs Sdn Bhd",
    addressLine1: "Jalan Sultan Ismail",
    city: "Kuala Lumpur",
    postalCode: "50250",
    countryCode: "MY",
  },
  customer: {
    legalName: "Acme Digital Sdn Bhd",
    addressLine1: "Jalan Ampang",
    city: "Kuala Lumpur",
    postalCode: "50450",
    countryCode: "MY",
    classification: "BUSINESS",
  },
  buyerType: "B2B",
  supplyType: "SAAS",
  lines: [
    {
      description: "Growth plan",
      quantity: 1,
      unitPrice: 1200,
      lineTotal: 1200,
      taxAmount: 72,
    },
  ],
  totals: {
    subtotal: 1200,
    taxTotal: 72,
    discountTotal: 0,
    grandTotal: 1272,
  },
});

const malaysiaValidation = validateUniversalInvoiceDocument(malaysiaDocument);
assert.equal(malaysiaValidation.document.deliveryModes.includes("xml_export"), true);
assert.equal(malaysiaValidation.document.deliveryModes.includes("api_submission"), true);
assert.equal(
  malaysiaValidation.document.deliveryModes.includes("government_gateway_submission"),
  true
);
assert.ok(
  malaysiaValidation.issues.some((issue) => issue.code === "EINVOICE_SUPPLIER_TAX_ID_REQUIRED"),
  "e-invoicing countries should emit structured e-invoicing validation errors"
);
assert.ok(
  malaysiaValidation.countryModule?.supportsEInvoicing(malaysiaValidation.document),
  "Malaysia should resolve as an e-invoicing-capable blueprint country"
);

const unitedStatesModule = resolveCountryComplianceModule("US");
assert.equal(unitedStatesModule?.implementationType, "SPECIALIZED");

const australiaModule = resolveCountryComplianceModule("AU");
assert.equal(
  australiaModule?.implementationType,
  "SPECIALIZED",
  "researched blueprint countries should now resolve through active specialized modules"
);

const saudiModule = resolveCountryComplianceModule("SA");
assert.equal(saudiModule?.implementationType, "SPECIALIZED");

console.log("invoicing blueprint engine passed");
