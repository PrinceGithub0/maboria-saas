import assert from "node:assert/strict";

import { dianProvider } from "@/lib/einvoicing/providers/dian";
import type { EInvoiceProviderContext } from "@/lib/einvoicing/types";

const buildContext = (overrides: Partial<EInvoiceProviderContext> = {}): EInvoiceProviderContext =>
  ({
    invoiceId: "inv-co-001",
    invoiceNumber: "CO-2026-0004",
    invoiceStatus: "DRAFT",
    sellerCountry: "CO",
    buyerCountry: "CO",
    currency: "COP",
    issuedAt: "2026-04-04T00:00:00.000Z",
    dueDate: "2026-04-14T00:00:00.000Z",
    connection: {
      provider: "CO_DIAN",
      country: "CO",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        nit: "900123456",
        softwareId: "SOFT-001",
        softwarePin: "PIN-001",
        certificatePem: "-----BEGIN CERTIFICATE-----",
        privateKeyPem: "-----BEGIN PRIVATE KEY-----",
        submissionUrl: "https://dian.example.test/submit",
        statusUrl: "https://dian.example.test/status",
      },
    },
    compliance: {
      sellerCountry: "CO",
      buyerCountry: "CO",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      taxLabel: "IVA",
      buyerType: "B2B",
      supplyType: "SERVICES",
      taxTreatment: "STANDARD_TAX",
    },
    business: {
      legalName: "Maboria Colombia SAS",
      taxId: "900123456",
      registrationNumber: "CO-REG-001",
      branchCode: "001",
      country: "CO",
      addressLine1: "Carrera 7 #10-20",
      city: "Bogota",
      postalCode: "110111",
      email: "billing@maboria.test",
      phone: "+5716000000",
    },
    customer: {
      legalName: "Acme Colombia SAS",
      contactName: "Acme Colombia SAS",
      taxId: "901234567",
      registrationNumber: "CO-REG-002",
      branchCode: "B01",
      country: "CO",
      addressLine1: "Calle 72 #12-34",
      city: "Bogota",
      postalCode: "110221",
      email: "finance@acme.test",
      phone: "+5716000001",
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
  const built = await Promise.resolve(dianProvider.buildPayload(buildContext()));
  const payload = built.payload as any;

  assert.equal(built.externalId, "CO-2026-0004");
  assert.equal(built.format, "UBL_XML");
  assert.equal(payload.documentProfile, "CO_DIAN");
  assert.equal(payload.documentType, "DIAN");
  assert.equal(payload.supplier.nit, "900123456");
  assert.equal(payload.customer.nit, "901234567");
  assert.equal(payload.invoiceLines.length, 1);
  assert.equal(payload.invoiceLines[0].classificationCode, "81112100");
  assert.equal(payload.invoiceTotals.total, 119);
  assert.equal(payload.transportPreparation.country, "CO");
  assert.equal(payload.transportPreparation.onboardingReady, true);
  assert.equal(payload.transportPreparation.signingReady, true);
  assert.equal(payload.transportPreparation.transmissionReady, true);
  assert.equal(payload.transportPreparation.liveSubmissionReady, true);
  assert.equal(payload.transportDocument, null);
  assert.ok(built.warnings.some((warning: string) => warning.includes("Signed DIAN UBL XML")));
  assert.ok(built.warnings.some((warning: string) => warning.includes("CUFE")));

  const validation = await Promise.resolve(dianProvider.validatePayload(built, buildContext()));
  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.ok((validation.warnings || []).some((warning) => warning.includes("Signed DIAN UBL XML")));
    assert.ok((validation.warnings || []).some((warning) => warning.includes("CUFE")));
  }

  const incompleteContext = buildContext({
    connection: {
      provider: "CO_DIAN",
      country: "CO",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        nit: "900123456",
      },
    },
    business: {
      legalName: "",
      taxId: "",
      country: "CO",
      addressLine1: "",
      city: "",
      postalCode: "",
    },
    customer: {
      legalName: "",
      country: "CO",
      addressLine1: "",
      city: "",
      postalCode: "",
    },
    items: [],
  });
  const incomplete = await Promise.resolve(dianProvider.buildPayload(incompleteContext));

  assert.ok((incomplete.warnings || []).some((warning: string) => warning.includes("Signed DIAN UBL XML")));
  assert.equal(typeof dianProvider.submit, "function");
  assert.equal(typeof dianProvider.getStatus, "function");
  assert.equal(typeof dianProvider.cancel, "function");
  const invalid = await Promise.resolve(dianProvider.validatePayload(incomplete, incompleteContext));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.errors.join(" "), /Supplier legal name/);
    assert.match(invalid.errors.join(" "), /At least one invoice line/);
  }

  console.log("einvoicing dian provider passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
