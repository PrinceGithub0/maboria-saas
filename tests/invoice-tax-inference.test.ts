import assert from "node:assert/strict";
import Module from "node:module";

process.env.DATABASE_URL ??= "postgresql://local:test@localhost:5432/maboria";
process.env.NEXTAUTH_SECRET ??= "test-secret";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.PAYSTACK_SECRET_KEY ??= "pk-secret";
process.env.PAYSTACK_PUBLIC_KEY ??= "pk-public";
process.env.PAYSTACK_WEBHOOK_SECRET ??= "pk-webhook";
process.env.FLUTTERWAVE_SECRET_KEY ??= "flw-secret";
process.env.FLUTTERWAVE_PUBLIC_KEY ??= "flw-public";
process.env.OPENAI_API_KEY ??= "sk-test";

const moduleInternals = Module as typeof Module & {
  _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
};
const originalLoad = moduleInternals._load;
moduleInternals._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean) {
  if (request === "server-only") return {};
  return originalLoad.apply(this, [request, parent, isMain]);
};

const {
  buildBusinessProfileSnapshot,
  buildInvoiceBlueprintArtifacts,
  buildInvoiceComplianceSnapshot,
} = require("@/lib/invoice") as typeof import("@/lib/invoice");

const business = buildBusinessProfileSnapshot({
  businessName: "3Wager",
  country: "DE",
  defaultCurrency: "EUR",
  businessAddress: "Genterstrasse 47\nKiel\n24123",
  addressLine1: "Genterstrasse 47",
  city: "Kiel",
  postalCode: "24123",
  businessEmail: "billing@example.com",
  taxId: "DE123456789",
  vatEnabled: true,
  vatRate: 19,
  vatPricingMode: "EXCLUSIVE",
});

const domesticCompliance = buildInvoiceComplianceSnapshot({
  business,
  customer: {
    name: "Silverware GmbH",
    companyName: "Silverware GmbH",
    country: "DE",
    taxId: "DE3456789098",
    streetAddress: "Budapester Strasse 32",
    city: "Krogaspe",
    postalCode: "24644",
  },
  items: [{ name: "Auslieferung + Fahrer Zahlung", quantity: 4, price: 450 }],
  buyerType: "B2B",
  supplyType: "SERVICES",
});

const domesticArtifacts = buildInvoiceBlueprintArtifacts({
  invoiceNumber: "3W6W-26-0002",
  issueDate: new Date("2026-03-31T00:00:00.000Z"),
  dueDate: new Date("2026-04-30T00:00:00.000Z"),
  currency: "EUR",
  business,
  customer: {
    name: "Silverware GmbH",
    companyName: "Silverware GmbH",
    country: "DE",
    taxId: "DE3456789098",
    streetAddress: "Budapester Strasse 32",
    city: "Krogaspe",
    postalCode: "24644",
  },
  items: [{ name: "Auslieferung + Fahrer Zahlung", quantity: 4, price: 450 }],
  totals: {
    subtotal: 1800,
    taxAmount: 342,
    discountAmount: 0,
    total: 2142,
  },
  buyerType: "B2B",
  supplyType: "SERVICES",
  compliance: domesticCompliance,
});

assert.equal(domesticArtifacts.document.taxBreakdown[0]?.taxRate, 19);
assert.equal(domesticArtifacts.document.taxBreakdown[0]?.taxAmount, 342);
assert.ok(
  !domesticArtifacts.validation.issues.some((issue) => issue.code === "GENERIC_GRAND_TOTAL_MISMATCH"),
  "German domestic VAT totals should infer a matching line-level tax breakdown"
);

const reverseChargeCompliance = buildInvoiceComplianceSnapshot({
  business,
  customer: {
    name: "Paris Consulting SARL",
    companyName: "Paris Consulting SARL",
    country: "FR",
    taxId: "FR12345678901",
    streetAddress: "10 Rue Example",
    city: "Paris",
    postalCode: "75001",
  },
  items: [{ name: "Consulting", quantity: 1, price: 1000 }],
  buyerType: "B2B",
  supplyType: "SERVICES",
});

const reverseChargeArtifacts = buildInvoiceBlueprintArtifacts({
  invoiceNumber: "3W6W-26-0003",
  issueDate: new Date("2026-03-31T00:00:00.000Z"),
  dueDate: new Date("2026-04-30T00:00:00.000Z"),
  currency: "EUR",
  business,
  customer: {
    name: "Paris Consulting SARL",
    companyName: "Paris Consulting SARL",
    country: "FR",
    taxId: "FR12345678901",
    streetAddress: "10 Rue Example",
    city: "Paris",
    postalCode: "75001",
  },
  items: [{ name: "Consulting", quantity: 1, price: 1000 }],
  totals: {
    subtotal: 1000,
    taxAmount: 0,
    discountAmount: 0,
    total: 1000,
  },
  buyerType: "B2B",
  supplyType: "SERVICES",
  compliance: reverseChargeCompliance,
});

assert.equal(reverseChargeArtifacts.document.taxBreakdown[0]?.taxRate, 0);
assert.equal(reverseChargeArtifacts.document.taxBreakdown[0]?.taxAmount, 0);
assert.ok(
  String(reverseChargeArtifacts.document.taxBreakdown[0]?.exemptionReason || "").length > 0,
  "Reverse-charge tax breakdown should carry an explanatory reason"
);
assert.ok(
  !reverseChargeArtifacts.validation.issues.some((issue) => issue.code === "DE_REVERSE_CHARGE_REFERENCE_REQUIRED"),
  "Reverse-charge invoices should not emit a missing-reference warning when the reason is inferred"
);

moduleInternals._load = originalLoad;
console.log("invoice tax inference passed");
