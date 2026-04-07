import assert from "node:assert/strict";

import { navOnlineInvoiceProvider } from "@/lib/einvoicing/providers/nav-online-invoice";
import type { EInvoiceProviderContext } from "@/lib/einvoicing/types";

const buildContext = (overrides: Partial<EInvoiceProviderContext> = {}): EInvoiceProviderContext =>
  ({
    invoiceId: "inv-hu-001",
    invoiceNumber: "HU-2026-0006",
    invoiceStatus: "DRAFT",
    sellerCountry: "HU",
    buyerCountry: "HU",
    currency: "HUF",
    issuedAt: "2026-04-04T00:00:00.000Z",
    dueDate: "2026-04-14T00:00:00.000Z",
    connection: {
      provider: "HU_NAV",
      country: "HU",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        taxNumber: "12345678",
        technicalUserName: "TECHUSER",
        technicalUserPassword: "TECHPASS",
        signingKey: "SIGNKEY",
        exchangeKey: "EXCHANGEKEY",
        submissionUrl: "https://nav.example.test/submit",
        statusUrl: "https://nav.example.test/status",
      },
    },
    compliance: {
      sellerCountry: "HU",
      buyerCountry: "HU",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      taxLabel: "VAT",
      buyerType: "B2B",
      supplyType: "SERVICES",
      taxTreatment: "STANDARD_TAX",
    },
    business: {
      legalName: "Maboria Hungary Kft",
      taxId: "12345678",
      registrationNumber: "HU-REG-001",
      branchCode: "001",
      country: "HU",
      addressLine1: "Fo utca 1",
      city: "Budapest",
      postalCode: "1011",
      email: "billing@maboria.test",
      phone: "+3616000000",
    },
    customer: {
      legalName: "Acme Hungary Kft",
      contactName: "Acme Hungary Kft",
      taxId: "87654321",
      registrationNumber: "HU-REG-002",
      branchCode: "B01",
      country: "HU",
      addressLine1: "Rakoczi ut 2",
      city: "Budapest",
      postalCode: "1072",
      email: "finance@acme.test",
      phone: "+3616000001",
    },
    items: [
      {
        name: "Annual subscription",
        description: "SaaS access",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        taxAmount: 27,
        unitCode: "EA",
        classificationCode: "81112100",
        taxCategory: "VAT",
        incomeClassification: "S0",
      },
    ],
    totals: {
      subtotal: 100,
      taxAmount: 27,
      discountAmount: 0,
      total: 127,
    },
    ...overrides,
  }) as EInvoiceProviderContext;

async function main() {
  const built = await Promise.resolve(navOnlineInvoiceProvider.buildPayload(buildContext()));
  const payload = built.payload as any;

  assert.equal(built.externalId, "HU-2026-0006");
  assert.equal(built.format, "REPORTING");
  assert.equal(payload.documentProfile, "HU_NAV");
  assert.equal(payload.supplier.taxNumber, "12345678");
  assert.equal(payload.customer.taxNumber, "87654321");
  assert.equal(payload.invoiceLines.length, 1);
  assert.equal(payload.invoiceLines[0].classificationCode, "81112100");
  assert.equal(payload.invoiceTotals.total, 127);
  assert.equal(payload.transportPreparation.country, "HU");
  assert.equal(payload.transportPreparation.onboardingReady, true);
  assert.equal(payload.transportPreparation.signingReady, true);
  assert.equal(payload.transportPreparation.transmissionReady, true);
  assert.equal(payload.transportPreparation.liveSubmissionReady, true);
  assert.equal(payload.transportDocument, null);
  assert.ok(built.warnings.some((warning: string) => warning.includes("Signed NAV invoice payload")));
  assert.ok(built.warnings.some((warning: string) => warning.includes("transaction identifier")));

  const validation = await Promise.resolve(navOnlineInvoiceProvider.validatePayload(built, buildContext()));
  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.ok((validation.warnings || []).some((warning) => warning.includes("Signed NAV invoice payload")));
    assert.ok((validation.warnings || []).some((warning) => warning.includes("transaction identifier")));
  }

  const incompleteContext = buildContext({
    connection: {
      provider: "HU_NAV",
      country: "HU",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        taxNumber: "12345678",
      },
    },
    business: {
      legalName: "",
      taxId: "",
      country: "HU",
    },
    customer: {
      legalName: "",
      country: "HU",
    },
    items: [],
  });
  const incomplete = await Promise.resolve(navOnlineInvoiceProvider.buildPayload(incompleteContext));
  assert.ok((incomplete.warnings || []).some((warning: string) => warning.includes("Signed NAV invoice payload")));
  assert.equal(typeof navOnlineInvoiceProvider.submit, "function");
  assert.equal(typeof navOnlineInvoiceProvider.getStatus, "function");
  assert.equal(typeof navOnlineInvoiceProvider.cancel, "function");

  const invalid = await Promise.resolve(navOnlineInvoiceProvider.validatePayload(incomplete, incompleteContext));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.errors.join(" "), /Supplier legal name/);
    assert.match(invalid.errors.join(" "), /At least one invoice line/);
  }

  console.log("einvoicing nav online invoice provider passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
