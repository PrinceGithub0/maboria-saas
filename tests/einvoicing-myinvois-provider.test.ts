import assert from "node:assert/strict";

import { myInvoisProvider } from "@/lib/einvoicing/providers/myinvois";
import type { EInvoiceProviderContext } from "@/lib/einvoicing/types";

const buildContext = (overrides: Partial<EInvoiceProviderContext> = {}): EInvoiceProviderContext =>
  ({
    invoiceId: "inv-my-001",
    invoiceNumber: "MY-2026-0008",
    invoiceStatus: "DRAFT",
    sellerCountry: "MY",
    buyerCountry: "MY",
    currency: "MYR",
    issuedAt: "2026-04-04T00:00:00.000Z",
    dueDate: "2026-04-14T00:00:00.000Z",
    connection: {
      provider: "MYINVOIS",
      country: "MY",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        clientId: "client-id",
        clientSecret: "client-secret",
        cancelUrl: "https://myinvois.example.test/cancel",
      },
    },
    compliance: {
      sellerCountry: "MY",
      buyerCountry: "MY",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      taxLabel: "SST",
      buyerType: "B2B",
      supplyType: "SERVICES",
      taxTreatment: "STANDARD_TAX",
    },
    business: {
      legalName: "Maboria Labs Sdn Bhd",
      taxId: "C2584563200",
      registrationNumber: "202601000001",
      sstRegistrationNumber: "B16-2408-32000001",
      country: "MY",
      addressLine1: "Level 10, Jalan Sultan Ismail",
      city: "Kuala Lumpur",
      postalCode: "50250",
      email: "billing@maboria.test",
      phone: "+60312345678",
    },
    customer: {
      legalName: "Acme Digital Sdn Bhd",
      contactName: "Acme Digital Sdn Bhd",
      taxId: "C1234567890",
      registrationNumber: "202501000002",
      country: "MY",
      addressLine1: "Jalan Ampang 1",
      city: "Kuala Lumpur",
      postalCode: "50450",
      email: "finance@acme.test",
      phone: "+60399999999",
    },
    items: [
      {
        name: "Annual subscription",
        description: "SaaS access",
        quantity: 1,
        unitPrice: 1200,
        lineTotal: 1200,
        taxAmount: 72,
      },
    ],
    totals: {
      subtotal: 1200,
      taxAmount: 72,
      discountAmount: 0,
      total: 1272,
    },
    ...overrides,
  }) as EInvoiceProviderContext;

async function main() {
  const built = await Promise.resolve(myInvoisProvider.buildPayload(buildContext()));
  const payload = built.payload as any;

  assert.equal(built.externalId, "MY-2026-0008");
  assert.equal(built.format, "JSON");
  assert.equal(payload.profileId, "MYINVOIS");
  assert.equal(payload.invoiceTypeCode, "01");
  assert.equal(payload.supplier.tin, "C2584563200");
  assert.equal(payload.buyer.tin, "C1234567890");
  assert.equal(payload.lines.length, 1);
  assert.equal(payload.lines[0].classificationCode, "022");
  assert.equal(payload.totals.payableAmount, 1272);
  assert.ok(built.warnings.some((warning: string) => warning.includes("classification defaults")));

  const validation = await Promise.resolve(myInvoisProvider.validatePayload(built, buildContext()));
  assert.equal(validation.ok, true);

  assert.equal(typeof myInvoisProvider.submit, "function");
  assert.equal(typeof myInvoisProvider.getStatus, "function");
  assert.equal(typeof myInvoisProvider.cancel, "function");

  const invalidContext = buildContext({
    business: {
      legalName: "",
      country: "MY",
      addressLine1: "",
      city: "Kuala Lumpur",
      postalCode: "50A50",
      email: "invalid",
      phone: "123 456",
    },
    customer: {
      legalName: "",
      country: "MY",
      addressLine1: "Jalan Buyer",
      city: "Petaling Jaya",
      postalCode: "47810",
    },
  });
  const invalid = await Promise.resolve(myInvoisProvider.validatePayload(built, invalidContext));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.errors.join(" "), /Supplier legal name/);
    assert.match(invalid.errors.join(" "), /Supplier TIN/);
    assert.match(invalid.errors.join(" "), /Buyer legal name/);
  }

  console.log("einvoicing myinvois provider passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
