import assert from "node:assert/strict";

import { sunatProvider } from "@/lib/einvoicing/providers/sunat";
import type { EInvoiceProviderContext } from "@/lib/einvoicing/types";

const buildContext = (overrides: Partial<EInvoiceProviderContext> = {}): EInvoiceProviderContext =>
  ({
    invoiceId: "inv-pe-001",
    invoiceNumber: "PE-2026-0005",
    invoiceStatus: "DRAFT",
    sellerCountry: "PE",
    buyerCountry: "PE",
    currency: "PEN",
    issuedAt: "2026-04-04T00:00:00.000Z",
    dueDate: "2026-04-14T00:00:00.000Z",
    connection: {
      provider: "PE_SUNAT",
      country: "PE",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        ruc: "20123456789",
        solUser: "SOLUSER",
        solPassword: "SOLPASS",
        certificatePem: "-----BEGIN CERTIFICATE-----",
        privateKeyPem: "-----BEGIN PRIVATE KEY-----",
        submissionUrl: "https://sunat.example.test/submit",
        statusUrl: "https://sunat.example.test/status",
      },
    },
    compliance: {
      sellerCountry: "PE",
      buyerCountry: "PE",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      taxLabel: "IGV",
      buyerType: "B2B",
      supplyType: "SERVICES",
      taxTreatment: "STANDARD_TAX",
    },
    business: {
      legalName: "Maboria Peru SAC",
      taxId: "20123456789",
      registrationNumber: "PE-REG-001",
      branchCode: "001",
      country: "PE",
      addressLine1: "Av. Arequipa 100",
      city: "Lima",
      postalCode: "15046",
      email: "billing@maboria.test",
      phone: "+5116000000",
    },
    customer: {
      legalName: "Acme Peru SAC",
      contactName: "Acme Peru SAC",
      taxId: "20987654321",
      registrationNumber: "PE-REG-002",
      branchCode: "B01",
      country: "PE",
      addressLine1: "Calle Los Laureles 50",
      city: "Lima",
      postalCode: "15047",
      email: "finance@acme.test",
      phone: "+5116000001",
    },
    items: [
      {
        name: "Annual subscription",
        description: "SaaS access",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        taxAmount: 18,
        unitCode: "NIU",
        classificationCode: "81112100",
        taxCategory: "IGV",
        incomeClassification: "S0",
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
  const built = await Promise.resolve(sunatProvider.buildPayload(buildContext()));
  const payload = built.payload as any;

  assert.equal(built.externalId, "PE-2026-0005");
  assert.equal(built.format, "UBL_XML");
  assert.equal(payload.documentProfile, "PE_SUNAT");
  assert.equal(payload.supplier.ruc, "20123456789");
  assert.equal(payload.customer.ruc, "20987654321");
  assert.equal(payload.invoiceLines.length, 1);
  assert.equal(payload.invoiceLines[0].classificationCode, "81112100");
  assert.equal(payload.invoiceTotals.total, 118);
  assert.equal(payload.transportPreparation.country, "PE");
  assert.equal(payload.transportPreparation.onboardingReady, true);
  assert.equal(payload.transportPreparation.signingReady, true);
  assert.equal(payload.transportPreparation.transmissionReady, true);
  assert.equal(payload.transportPreparation.liveSubmissionReady, true);
  assert.equal(payload.transportDocument, null);
  assert.ok(built.warnings.some((warning: string) => warning.includes("Signed SUNAT UBL XML")));
  assert.ok(built.warnings.some((warning: string) => warning.includes("ticket or CDR")));

  const validation = await Promise.resolve(sunatProvider.validatePayload(built, buildContext()));
  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.ok((validation.warnings || []).some((warning) => warning.includes("Signed SUNAT UBL XML")));
    assert.ok((validation.warnings || []).some((warning) => warning.includes("ticket or CDR")));
  }

  const incompleteContext = buildContext({
    connection: {
      provider: "PE_SUNAT",
      country: "PE",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        ruc: "20123456789",
      },
    },
    business: {
      legalName: "",
      taxId: "",
      country: "PE",
      addressLine1: "",
      city: "",
      postalCode: "",
    },
    customer: {
      legalName: "",
      country: "PE",
      addressLine1: "",
      city: "",
      postalCode: "",
    },
    items: [],
  });
  const incomplete = await Promise.resolve(sunatProvider.buildPayload(incompleteContext));
  assert.ok((incomplete.warnings || []).some((warning: string) => warning.includes("Signed SUNAT UBL XML")));
  assert.equal(typeof sunatProvider.submit, "function");
  assert.equal(typeof sunatProvider.getStatus, "function");
  assert.equal(typeof sunatProvider.cancel, "function");

  const invalid = await Promise.resolve(sunatProvider.validatePayload(incomplete, incompleteContext));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.errors.join(" "), /Supplier legal name/);
    assert.match(invalid.errors.join(" "), /At least one invoice line/);
  }

  console.log("einvoicing sunat provider passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
