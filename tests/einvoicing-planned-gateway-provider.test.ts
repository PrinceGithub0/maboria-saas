import assert from "node:assert/strict";

import { getEInvoiceProviders } from "@/lib/einvoicing/resolve-provider";
import type { EInvoiceProviderContext } from "@/lib/einvoicing/types";

const provider = getEInvoiceProviders().find((item) => item.key === "AE_EINVOICING");

const buildContext = (overrides: Partial<EInvoiceProviderContext> = {}): EInvoiceProviderContext =>
  ({
    invoiceId: "inv-ae-001",
    invoiceNumber: "AE-2026-0001",
    invoiceStatus: "DRAFT",
    sellerCountry: "AE",
    buyerCountry: "AE",
    currency: "AED",
    issuedAt: "2026-04-07T00:00:00.000Z",
    dueDate: "2026-04-14T00:00:00.000Z",
    connection: {
      provider: "AE_EINVOICING",
      country: "AE",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        companyTaxId: "AE123456789",
        apiKey: "gateway-secret",
        submissionUrl: "https://gateway.example.test/submit",
        statusUrl: "https://gateway.example.test/status",
        cancelUrl: "https://gateway.example.test/cancel",
      },
    },
    compliance: {
      sellerCountry: "AE",
      buyerCountry: "AE",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      buyerType: "B2B",
      supplyType: "SERVICES",
      taxLabel: "VAT",
      taxTreatment: "STANDARD_TAX",
    },
    business: {
      legalName: "Maboria Gulf LLC",
      taxId: "AE123456789",
      country: "AE",
      addressLine1: "Sheikh Zayed Road",
      city: "Dubai",
      postalCode: "00000",
      email: "billing@maboria.test",
      phone: "+971400000000",
    },
    customer: {
      legalName: "Acme Gulf LLC",
      taxId: "AE987654321",
      country: "AE",
      addressLine1: "Marina Walk",
      city: "Dubai",
      postalCode: "00001",
      email: "finance@acme.test",
      phone: "+971400000001",
    },
    items: [
      {
        name: "Annual subscription",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        taxAmount: 5,
      },
    ],
    totals: {
      subtotal: 100,
      taxAmount: 5,
      discountAmount: 0,
      total: 105,
    },
    ...overrides,
  }) as EInvoiceProviderContext;

async function main() {
  assert.ok(provider, "AE planned gateway provider should be registered");
  const built = await Promise.resolve(provider!.buildPayload(buildContext()));
  const payload = built.payload as any;

  assert.equal(built.externalId, "AE-2026-0001");
  assert.equal(built.format, "JSON");
  assert.equal(payload.documentProfile, "AE_EINVOICING");
  assert.equal(payload.transportPreparation.country, "AE");
  assert.equal(payload.transportPreparation.liveSubmissionReady, true);
  assert.equal(payload.supplier.taxId, "AE123456789");
  assert.equal(payload.customer.taxId, "AE987654321");
  assert.equal(payload.invoiceLines.length, 1);

  const validation = await Promise.resolve(provider!.validatePayload(built, buildContext()));
  assert.equal(validation.ok, true);
  assert.equal(typeof provider!.submit, "function");
  assert.equal(typeof provider!.getStatus, "function");
  assert.equal(typeof provider!.cancel, "function");

  const invalid = await Promise.resolve(
    provider!.validatePayload(
      built,
      buildContext({
        business: { legalName: "", taxId: "", country: "AE" },
        customer: { legalName: "", country: "AE" },
        items: [],
      })
    )
  );
  assert.equal(invalid.ok, false);

  console.log("einvoicing planned gateway provider passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
