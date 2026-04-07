import assert from "node:assert/strict";

import { sdiProvider } from "@/lib/einvoicing/providers/sdi";
import type { EInvoiceProviderContext } from "@/lib/einvoicing/types";

const buildContext = (overrides: Partial<EInvoiceProviderContext> = {}): EInvoiceProviderContext =>
  ({
    invoiceId: "inv-it-001",
    invoiceNumber: "IT-2026-0001",
    invoiceStatus: "DRAFT",
    sellerCountry: "IT",
    buyerCountry: "IT",
    currency: "EUR",
    issuedAt: "2026-04-04T00:00:00.000Z",
    dueDate: "2026-04-14T00:00:00.000Z",
    compliance: {
      sellerCountry: "IT",
      buyerCountry: "IT",
      buyerType: "B2B",
      supplyType: "SERVICES",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      taxLabel: "VAT",
    },
    connection: {
      provider: "IT_SDI",
      country: "IT",
      sandbox: true,
      status: "ACTIVE",
      hasCredentials: true,
      credentials: {
        vatNumber: "IT12345678901",
        transmissionId: "TRASM-001",
        recipientCode: "ABC1234",
        pecEmail: "billing@example.it",
        certificatePem: "-----BEGIN CERTIFICATE-----",
        privateKeyPem: "-----BEGIN PRIVATE KEY-----",
        submissionUrl: "https://sdi.example.test/submit",
        statusUrl: "https://sdi.example.test/status",
      },
    },
    business: {
      legalName: "Maboria Italia SRL",
      taxId: "IT12345678901",
      registrationNumber: "MI-2026-0001",
      branchCode: "01",
      country: "IT",
      addressLine1: "Via Roma 1",
      city: "Milano",
      postalCode: "20100",
      email: "billing@maboria.test",
      phone: "+390200000001",
    },
    customer: {
      legalName: "Acme Italia SRL",
      contactName: "Acme Italia SRL",
      taxId: "IT99887766554",
      registrationNumber: "MI-2025-0099",
      branchCode: "A1",
      country: "IT",
      addressLine1: "Corso Italia 10",
      city: "Milano",
      postalCode: "20121",
      email: "finance@acme.test",
      phone: "+390200000002",
    },
    items: [
      {
        name: "Subscription",
        description: "SaaS access",
        quantity: 1,
        unitPrice: 120,
        lineTotal: 120,
        taxAmount: 26.4,
        unitCode: "EA",
        classificationCode: "6201",
        taxCategory: "VAT",
        incomeClassification: "A100",
      },
    ],
    totals: {
      subtotal: 120,
      taxAmount: 26.4,
      discountAmount: 0,
      total: 146.4,
    },
    ...overrides,
  }) as EInvoiceProviderContext;

async function main() {
  const built = await Promise.resolve(sdiProvider.buildPayload(buildContext()));
  const payload = built.payload as any;

  assert.equal(built.format, "UBL_XML");
  assert.equal(built.externalId, "IT-2026-0001");
  assert.equal(payload.documentProfile, "IT_SDI");
  assert.equal(payload.supplier.legalName, "Maboria Italia SRL");
  assert.equal(payload.customer.legalName, "Acme Italia SRL");
  assert.equal(payload.transmissionPreparation.country, "IT");
  assert.equal(payload.transportDocument, null);
  assert.equal(payload.invoiceLines.length, 1);
  assert.equal(payload.invoiceLines[0].classificationCode, "6201");
  assert.equal(payload.totals.total, 146.4);
  assert.ok(built.warnings.some((warning: string) => warning.includes("Signed FatturaPA XML")));
  assert.ok(built.warnings.some((warning: string) => warning.includes("UUID")));

  const preparation = payload.transmissionPreparation;
  assert.equal(preparation.onboardingReady, true);
  assert.equal(preparation.transmissionReady, true);
  assert.equal(preparation.productionReady, false);
  assert.equal(preparation.liveSubmissionReady, true);
  assert.equal(preparation.liveSubmissionBlockedReason, null);

  const validation = await Promise.resolve(sdiProvider.validatePayload(built, buildContext()));
  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.ok((validation.warnings || []).some((warning) => warning.includes("Signed FatturaPA XML")));
    assert.ok((validation.warnings || []).some((warning) => warning.includes("UUID")));
  }

  const incompleteContext = buildContext({
    connection: {
      provider: "IT_SDI",
      country: "IT",
      sandbox: true,
      status: "ACTIVE",
      hasCredentials: false,
    },
    business: {
      legalName: "",
      taxId: "",
      country: "IT",
      addressLine1: "",
      city: "",
      postalCode: "",
    },
    customer: {
      legalName: "",
      taxId: "",
      country: "IT",
      addressLine1: "",
      city: "",
      postalCode: "",
    },
    items: [],
  });

  const invalidBuilt = await Promise.resolve(sdiProvider.buildPayload(incompleteContext));
  const invalid = await Promise.resolve(sdiProvider.validatePayload(invalidBuilt, incompleteContext));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.errors.join(" "), /Supplier VAT number/);
    assert.match(invalid.errors.join(" "), /At least one invoice line/);
  }

  assert.equal(typeof sdiProvider.submit, "function");
  assert.equal(typeof sdiProvider.getStatus, "function");
  assert.equal(typeof sdiProvider.cancel, "function");

  console.log("einvoicing sdi provider passed");
}

main();
