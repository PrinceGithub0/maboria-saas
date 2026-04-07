import assert from "node:assert/strict";

import { resolveInvoiceEInvoicingSnapshot } from "@/lib/einvoicing/resolve-provider";
import { submitEInvoiceDocument } from "@/lib/einvoicing/submit-document";

const unitedArabEmiratesSnapshot = resolveInvoiceEInvoicingSnapshot({
  invoiceNumber: "INV-AE-001",
  invoiceStatus: "DRAFT",
  sellerCountry: "AE",
  buyerCountry: "AE",
  currency: "AED",
  connection: {
    provider: "AE_EINVOICING",
    country: "AE",
    status: "ACTIVE",
    sandbox: false,
    hasCredentials: true,
    lastValidatedAt: "2026-04-07T12:00:00.000Z",
    credentials: {
      companyTaxId: "AE123456789",
      apiKey: "gateway-key",
      submissionUrl: "https://gateway.test/submit",
      statusUrl: "https://gateway.test/status",
      cancelUrl: "https://gateway.test/cancel",
    },
  },
  compliance: {
    sellerCountry: "AE",
    buyerCountry: "AE",
    requiresEInvoicing: true,
    supportLevel: "LIMITED",
    taxLabel: "VAT",
  },
});

assert.equal(unitedArabEmiratesSnapshot.status, "READY");
assert.equal(unitedArabEmiratesSnapshot.productionReady, false);
assert.ok(
  unitedArabEmiratesSnapshot.productionBlockers.some((blocker) =>
    blocker.includes("Legal and tax production signoff")
  )
);

async function main() {
  const submission = await submitEInvoiceDocument({
    invoiceNumber: "INV-AE-002",
    invoiceStatus: "DRAFT",
    sellerCountry: "AE",
    buyerCountry: "AE",
    currency: "AED",
    connection: {
      provider: "AE_EINVOICING",
      country: "AE",
      status: "ACTIVE",
      sandbox: false,
      hasCredentials: true,
      lastValidatedAt: "2026-04-07T12:00:00.000Z",
      credentials: {
        companyTaxId: "AE123456789",
        apiKey: "gateway-key",
        submissionUrl: "https://gateway.test/submit",
        statusUrl: "https://gateway.test/status",
        cancelUrl: "https://gateway.test/cancel",
      },
    },
    business: {
      legalName: "Maboria FZ-LLC",
      taxId: "AE123456789",
      country: "AE",
      addressLine1: "Dubai Internet City",
      city: "Dubai",
      postalCode: "00000",
      email: "billing@maboria.test",
      phone: "+97140000000",
    },
    customer: {
      legalName: "Acme Gulf LLC",
      contactName: "Acme Gulf LLC",
      taxId: "AE987654321",
      country: "AE",
      addressLine1: "Abu Dhabi",
      city: "Abu Dhabi",
      postalCode: "00000",
      email: "finance@acme.test",
      phone: "+97141111111",
    },
    items: [
      {
        name: "Platform subscription",
        quantity: 1,
        unitPrice: 1200,
        lineTotal: 1200,
      },
    ],
    totals: {
      subtotal: 1200,
      taxAmount: 60,
      discountAmount: 0,
      total: 1260,
    },
    compliance: {
      sellerCountry: "AE",
      buyerCountry: "AE",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      taxLabel: "VAT",
      buyerType: "B2B",
      supplyType: "SERVICES",
    },
  });

  assert.equal(submission.snapshot.status, "VALIDATION_FAILED");
  assert.match(
    String(submission.snapshot.lastError || ""),
    /schema validation|legal and tax production signoff|production acceptance/i
  );

  console.log("einvoicing launch gating passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
