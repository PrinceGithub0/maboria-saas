import assert from "node:assert/strict";

import { mdEFacturaProvider } from "@/lib/einvoicing/providers/md-efactura";
import type { EInvoiceProviderContext } from "@/lib/einvoicing/types";

const buildContext = (overrides: Partial<EInvoiceProviderContext> = {}): EInvoiceProviderContext =>
  ({
    invoiceId: "inv-md-001",
    invoiceNumber: "MD-2026-0007",
    invoiceStatus: "DRAFT",
    sellerCountry: "MD",
    buyerCountry: "MD",
    currency: "MDL",
    issuedAt: "2026-04-04T00:00:00.000Z",
    dueDate: "2026-04-14T00:00:00.000Z",
    connection: {
      provider: "MD_EFACTURA",
      country: "MD",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        taxpayerCode: "1002600000000",
        username: "sfs-user",
        password: "sfs-pass",
        certificatePem: "-----BEGIN CERTIFICATE-----",
        privateKeyPem: "-----BEGIN PRIVATE KEY-----",
        submissionUrl: "https://md.example.test/submit",
        statusUrl: "https://md.example.test/status",
      },
    },
    compliance: {
      sellerCountry: "MD",
      buyerCountry: "MD",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      taxLabel: "VAT",
      buyerType: "B2B",
      supplyType: "SERVICES",
      taxTreatment: "STANDARD_TAX",
    },
    business: {
      legalName: "Maboria Moldova SRL",
      taxId: "1002600000000",
      registrationNumber: "MD-REG-001",
      branchCode: "001",
      country: "MD",
      addressLine1: "Strada Stefan cel Mare 1",
      city: "Chisinau",
      postalCode: "MD-2001",
      email: "billing@maboria.test",
      phone: "+37322000000",
    },
    customer: {
      legalName: "Acme Moldova SRL",
      contactName: "Acme Moldova SRL",
      taxId: "1003600000000",
      registrationNumber: "MD-REG-002",
      branchCode: "B01",
      country: "MD",
      addressLine1: "Strada Independentei 2",
      city: "Chisinau",
      postalCode: "MD-2002",
      email: "finance@acme.test",
      phone: "+37322000001",
    },
    items: [
      {
        name: "Annual subscription",
        description: "SaaS access",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        taxAmount: 20,
        unitCode: "EA",
        classificationCode: "81112100",
        taxCategory: "VAT",
        incomeClassification: "S0",
      },
    ],
    totals: {
      subtotal: 100,
      taxAmount: 20,
      discountAmount: 0,
      total: 120,
    },
    ...overrides,
  }) as EInvoiceProviderContext;

async function main() {
  const built = await Promise.resolve(mdEFacturaProvider.buildPayload(buildContext()));
  const payload = built.payload as any;

  assert.equal(built.externalId, "MD-2026-0007");
  assert.equal(built.format, "UBL_XML");
  assert.equal(payload.documentProfile, "MD_EFACTURA");
  assert.equal(payload.supplier.taxpayerCode, "1002600000000");
  assert.equal(payload.customer.taxpayerCode, "1003600000000");
  assert.equal(payload.invoiceLines.length, 1);
  assert.equal(payload.invoiceLines[0].classificationCode, "81112100");
  assert.equal(payload.invoiceTotals.total, 120);
  assert.equal(payload.transportPreparation.country, "MD");
  assert.equal(payload.transportPreparation.onboardingReady, true);
  assert.equal(payload.transportPreparation.signingReady, true);
  assert.equal(payload.transportPreparation.transmissionReady, true);
  assert.equal(payload.transportPreparation.liveSubmissionReady, true);
  assert.equal(payload.transportDocument, null);
  assert.ok(built.warnings.some((warning: string) => warning.includes("Signed Moldova e-Factura XML")));
  assert.ok(built.warnings.some((warning: string) => warning.includes("submission identifier")));

  const validation = await Promise.resolve(mdEFacturaProvider.validatePayload(built, buildContext()));
  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.ok((validation.warnings || []).some((warning) => warning.includes("Signed Moldova e-Factura XML")));
    assert.ok((validation.warnings || []).some((warning) => warning.includes("submission identifier")));
  }

  const incompleteContext = buildContext({
    connection: {
      provider: "MD_EFACTURA",
      country: "MD",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        taxpayerCode: "1002600000000",
      },
    },
    business: {
      legalName: "",
      taxId: "",
      country: "MD",
      addressLine1: "",
      city: "",
      postalCode: "",
    },
    customer: {
      legalName: "",
      country: "MD",
      addressLine1: "",
      city: "",
      postalCode: "",
    },
    items: [],
  });
  const incomplete = await Promise.resolve(mdEFacturaProvider.buildPayload(incompleteContext));
  assert.ok((incomplete.warnings || []).some((warning: string) => warning.includes("Signed Moldova e-Factura XML")));
  assert.equal(typeof mdEFacturaProvider.submit, "function");
  assert.equal(typeof mdEFacturaProvider.getStatus, "function");
  assert.equal(typeof mdEFacturaProvider.cancel, "function");

  const invalid = await Promise.resolve(mdEFacturaProvider.validatePayload(incomplete, incompleteContext));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.errors.join(" "), /Supplier legal name/);
    assert.match(invalid.errors.join(" "), /At least one invoice line/);
  }

  console.log("einvoicing md efactura provider passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
