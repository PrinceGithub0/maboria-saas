import assert from "node:assert/strict";

import { dteProvider } from "@/lib/einvoicing/providers/dte";
import type { EInvoiceProviderContext } from "@/lib/einvoicing/types";

const buildContext = (overrides: Partial<EInvoiceProviderContext> = {}): EInvoiceProviderContext =>
  ({
    invoiceId: "inv-cl-001",
    invoiceNumber: "CL-2026-0003",
    invoiceStatus: "DRAFT",
    sellerCountry: "CL",
    buyerCountry: "CL",
    currency: "CLP",
    issuedAt: "2026-04-04T00:00:00.000Z",
    dueDate: "2026-04-14T00:00:00.000Z",
    connection: {
      provider: "CL_DTE",
      country: "CL",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        rut: "76012345-6",
        siiUser: "sii-user",
        siiPassword: "sii-password",
        certificatePem: "-----BEGIN CERTIFICATE-----",
        privateKeyPem: "-----BEGIN PRIVATE KEY-----",
        submissionUrl: "https://sii.example.test/submit",
        statusUrl: "https://sii.example.test/status",
      },
    },
    compliance: {
      sellerCountry: "CL",
      buyerCountry: "CL",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      taxLabel: "IVA",
      buyerType: "B2B",
      supplyType: "SERVICES",
      taxTreatment: "STANDARD_TAX",
    },
    business: {
      legalName: "Maboria Chile SpA",
      taxId: "76012345-6",
      registrationNumber: "CL-REG-001",
      branchCode: "001",
      country: "CL",
      addressLine1: "Avenida Providencia 123",
      addressLine2: "Piso 5",
      city: "Santiago",
      postalCode: "7500000",
      email: "billing@maboria.test",
      phone: "+56210000000",
    },
    customer: {
      legalName: "Acme Chile SpA",
      contactName: "Acme Chile SpA",
      taxId: "76123456-7",
      registrationNumber: "CL-REG-002",
      branchCode: "B01",
      country: "CL",
      addressLine1: "Avenida Apoquindo 3000",
      city: "Santiago",
      postalCode: "7550000",
      email: "finance@acme.test",
      phone: "+56210000001",
    },
    items: [
      {
        name: "Annual subscription",
        description: "SaaS access",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        taxAmount: 19,
        unitCode: "EA",
        classificationCode: "81112100",
        taxCategory: "IVA",
        incomeClassification: "S0",
      },
    ],
    totals: {
      subtotal: 100,
      taxAmount: 19,
      discountAmount: 0,
      total: 119,
    },
    ...overrides,
  }) as EInvoiceProviderContext;

async function main() {
  const built = await Promise.resolve(dteProvider.buildPayload(buildContext()));
  const payload = built.payload as any;

  assert.equal(built.externalId, "CL-2026-0003");
  assert.equal(built.format, "UBL_XML");
  assert.equal(payload.documentProfile, "CL_DTE");
  assert.equal(payload.documentType, "DTE");
  assert.equal(payload.supplier.rut, "76012345-6");
  assert.equal(payload.customer.rut, "76123456-7");
  assert.equal(payload.invoiceLines.length, 1);
  assert.equal(payload.invoiceLines[0].classificationCode, "81112100");
  assert.equal(payload.invoiceTotals.total, 119);
  assert.equal(payload.transportPreparation.country, "CL");
  assert.equal(payload.transportPreparation.onboardingReady, true);
  assert.equal(payload.transportPreparation.signingReady, true);
  assert.equal(payload.transportPreparation.transmissionReady, true);
  assert.equal(payload.transportPreparation.liveSubmissionReady, true);
  assert.equal(payload.transportDocument, null);
  assert.ok(built.warnings.some((warning: string) => warning.includes("Signed DTE XML")));
  assert.ok(built.warnings.some((warning: string) => warning.includes("track ID")));

  const validation = await Promise.resolve(dteProvider.validatePayload(built, buildContext()));
  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.ok((validation.warnings || []).some((warning) => warning.includes("Signed DTE XML")));
    assert.ok((validation.warnings || []).some((warning) => warning.includes("track ID")));
  }

  const incompleteContext = buildContext({
    connection: {
      provider: "CL_DTE",
      country: "CL",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        rut: "76012345-6",
      },
    },
    business: {
      legalName: "",
      taxId: "",
      country: "CL",
      addressLine1: "",
      city: "",
      postalCode: "",
    },
    customer: {
      legalName: "",
      country: "CL",
      addressLine1: "",
      city: "",
      postalCode: "",
    },
    items: [],
  });
  const incomplete = await Promise.resolve(dteProvider.buildPayload(incompleteContext));

  assert.ok((incomplete.warnings || []).some((warning: string) => warning.includes("Signed DTE XML")));
  assert.equal(typeof dteProvider.submit, "function");
  assert.equal(typeof dteProvider.getStatus, "function");
  assert.equal(typeof dteProvider.cancel, "function");
  const invalid = await Promise.resolve(dteProvider.validatePayload(incomplete, incompleteContext));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.errors.join(" "), /Supplier legal name/);
    assert.match(invalid.errors.join(" "), /At least one invoice line/);
  }

  console.log("einvoicing dte provider passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
