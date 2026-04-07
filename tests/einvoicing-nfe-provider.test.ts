import assert from "node:assert/strict";

import { nfeProvider } from "@/lib/einvoicing/providers/nfe";
import type { EInvoiceProviderContext } from "@/lib/einvoicing/types";

const buildContext = (overrides: Partial<EInvoiceProviderContext> = {}): EInvoiceProviderContext =>
  ({
    invoiceId: "inv-br-001",
    invoiceNumber: "BR-2026-0001",
    invoiceStatus: "DRAFT",
    sellerCountry: "BR",
    buyerCountry: "BR",
    currency: "BRL",
    issuedAt: "2026-04-04T00:00:00.000Z",
    dueDate: "2026-04-14T00:00:00.000Z",
    connection: {
      provider: "BR_NFE",
      country: "BR",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        cnpj: "12345678000199",
        certificatePem: "-----BEGIN CERTIFICATE-----",
        privateKeyPem: "-----BEGIN PRIVATE KEY-----",
        uf: "SP",
        submissionUrl: "https://sefaz.example.test/submit",
        statusUrl: "https://sefaz.example.test/status",
      },
    },
    compliance: {
      sellerCountry: "BR",
      buyerCountry: "BR",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      taxLabel: "ICMS",
      buyerType: "B2B",
      supplyType: "GOODS",
      taxTreatment: "STANDARD_TAX",
    },
    business: {
      legalName: "Maboria Brasil Ltda",
      taxId: "12345678000199",
      registrationNumber: "1234567",
      branchCode: "0001",
      country: "BR",
      state: "SP",
      addressLine1: "Avenida Paulista 1000",
      city: "Sao Paulo",
      postalCode: "01310-100",
      email: "billing@maboria.test",
      phone: "+5511999999999",
    },
    customer: {
      legalName: "Acme Brasil Ltda",
      contactName: "Acme Brasil Ltda",
      taxId: "98765432000188",
      registrationNumber: "7654321",
      branchCode: "0001",
      country: "BR",
      addressLine1: "Rua Exemplo 10",
      city: "Sao Paulo",
      state: "SP",
      postalCode: "04000-000",
      email: "finance@acme.test",
      phone: "+5511888888888",
    },
    items: [
      {
        name: "Annual subscription",
        description: "SaaS access",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        taxAmount: 18,
        unitCode: "UN",
        classificationCode: "6201",
        taxCategory: "ICMS",
        incomeClassification: "0601",
      },
    ],
    totals: {
      subtotal: 100,
      taxAmount: 18,
      discountAmount: 0,
      total: 118,
    },
    ...overrides,
  }) as EInvoiceProviderContext;

async function main() {
  const built = await Promise.resolve(nfeProvider.buildPayload(buildContext()));
  assert.equal(built.externalId, "BR-2026-0001");
  assert.equal(built.format, "UBL_XML");

  const payload = built.payload as any;
  assert.equal(payload.providerKey, "BR_NFE");
  assert.equal(payload.documentType, "NF-e");
  assert.equal(payload.supplier.cnpj, "12345678000199");
  assert.equal(payload.supplier.uf, "SP");
  assert.equal(payload.customer.legalName, "Acme Brasil Ltda");
  assert.equal(payload.invoiceLines.length, 1);
  assert.equal(payload.invoiceLines[0].classificationCode, "6201");
  assert.equal(payload.invoiceTotals.total, 118);
  assert.equal(payload.transportPreparation.onboardingReady, true);
  assert.equal(payload.transportPreparation.signingReady, true);
  assert.equal(payload.transportPreparation.transmissionReady, true);
  assert.equal(payload.transportPreparation.liveSubmissionReady, true);
  assert.equal(payload.transportDocument, null);
  assert.ok(built.warnings.some((warning) => warning.includes("Signed NF-e XML")));
  assert.ok(built.warnings.some((warning) => warning.includes("access key or UUID")));

  const validation = await Promise.resolve(nfeProvider.validatePayload(built, buildContext()));
  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.ok((validation.warnings || []).some((warning) => warning.includes("Signed NF-e XML")));
    assert.ok((validation.warnings || []).some((warning) => warning.includes("access key or UUID")));
  }
  assert.equal(
    (nfeProvider.buildWarnings?.(buildContext()) || []).some((warning) => warning.includes("live SEFAZ submission")),
    true
  );
  assert.equal(typeof nfeProvider.submit, "function");
  assert.equal(typeof nfeProvider.getStatus, "function");
  assert.equal(typeof nfeProvider.cancel, "function");

  const brokenContext = buildContext({
    business: {
      legalName: "",
      taxId: "",
      country: "BR",
      addressLine1: "",
      city: "",
      state: "",
      postalCode: "",
    },
    customer: {
      legalName: "",
      country: "BR",
      addressLine1: "",
      city: "",
      postalCode: "",
    },
    items: [],
    connection: {
      provider: "BR_NFE",
      country: "BR",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {},
    },
  });

  const incomplete = await Promise.resolve(nfeProvider.buildPayload(brokenContext));
  const invalid = await Promise.resolve(
    nfeProvider.validatePayload(
      incomplete,
      brokenContext
    )
  );

  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.errors.join(" "), /Supplier legal name/);
    assert.match(invalid.errors.join(" "), /Supplier CNPJ/);
    assert.match(invalid.errors.join(" "), /At least one invoice line/);
  }

  assert.ok((incomplete.warnings || []).some((warning) => warning.includes("Supplier CNPJ")));

  console.log("einvoicing nfe provider passed");
}

main();
