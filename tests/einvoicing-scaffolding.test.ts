import assert from "node:assert/strict";

import { resolveInvoiceEInvoicingSnapshot } from "@/lib/einvoicing/resolve-provider";
import { submitEInvoiceDocument } from "@/lib/einvoicing/submit-document";
import { getMyInvoisSubmissionStatus } from "@/lib/einvoicing/providers/myinvois-client";

const malaysiaSnapshot = resolveInvoiceEInvoicingSnapshot({
  invoiceNumber: "INV-MY-001",
  invoiceStatus: "DRAFT",
  sellerCountry: "MY",
  buyerCountry: "MY",
  currency: "MYR",
  compliance: {
    sellerCountry: "MY",
    buyerCountry: "MY",
    requiresEInvoicing: true,
    supportLevel: "LIMITED",
    taxLabel: "SST",
  },
});

assert.equal(malaysiaSnapshot.providerKey, "MYINVOIS");
assert.equal(malaysiaSnapshot.requirement, "REQUIRED");
assert.equal(malaysiaSnapshot.status, "NOT_CONFIGURED");

const malaysiaConnectedSnapshot = resolveInvoiceEInvoicingSnapshot({
  invoiceNumber: "INV-MY-001A",
  invoiceStatus: "DRAFT",
  sellerCountry: "MY",
  buyerCountry: "MY",
  currency: "MYR",
  connection: {
    provider: "MYINVOIS",
    country: "MY",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
  },
  compliance: {
    sellerCountry: "MY",
    buyerCountry: "MY",
    requiresEInvoicing: true,
    supportLevel: "LIMITED",
    taxLabel: "SST",
  },
});

assert.equal(malaysiaConnectedSnapshot.status, "READY");

const brazilSnapshot = resolveInvoiceEInvoicingSnapshot({
  invoiceNumber: "INV-BR-001",
  invoiceStatus: "DRAFT",
  sellerCountry: "BR",
  buyerCountry: "BR",
  currency: "BRL",
  compliance: {
    sellerCountry: "BR",
    buyerCountry: "BR",
    requiresEInvoicing: true,
    supportLevel: "LIMITED",
    taxLabel: "Tax",
  },
});

assert.equal(brazilSnapshot.providerKey, "BR_NFE");
assert.equal(brazilSnapshot.status, "NOT_CONFIGURED");
assert.equal(brazilSnapshot.requirement, "REQUIRED");

const usSnapshot = resolveInvoiceEInvoicingSnapshot({
  invoiceNumber: "INV-US-001",
  invoiceStatus: "DRAFT",
  sellerCountry: "US",
  buyerCountry: "US",
  currency: "USD",
  compliance: {
    sellerCountry: "US",
    buyerCountry: "US",
    requiresEInvoicing: false,
    supportLevel: "ADVANCED",
    taxLabel: "Sales Tax",
  },
});

assert.equal(usSnapshot.status, "NOT_REQUIRED");
assert.equal(usSnapshot.requirement, "NOT_REQUIRED");

async function main() {
  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/connect/token")) {
      return new Response(
        JSON.stringify({
          access_token: "test-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/api/v1.0/documentsubmissions/") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          submissionUID: "SUB123456789",
          acceptedDocuments: [{ uuid: "DOC123", invoiceCodeNumber: "INV-MY-002" }],
          rejectedDocuments: [],
        }),
        { status: 202, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/api/v1.0/documentsubmissions/") && init?.method === "GET") {
      return new Response(
        JSON.stringify({
          submissionUid: "SUB123456789",
          overallStatus: "valid",
          documentSummary: [{ uuid: "DOC123", longId: "LONG123" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error(`Unexpected fetch call in test: ${url}`);
  }) as typeof fetch;

  try {
    const malaysiaSubmission = await submitEInvoiceDocument({
      invoiceNumber: "INV-MY-002",
      invoiceStatus: "DRAFT",
      sellerCountry: "MY",
      buyerCountry: "MY",
      currency: "MYR",
      issuedAt: "2026-04-03T00:00:00.000Z",
      dueDate: "2026-04-10T00:00:00.000Z",
      connection: {
        provider: "MYINVOIS",
        country: "MY",
        status: "ACTIVE",
        sandbox: false,
        hasCredentials: true,
        lastValidatedAt: "2026-04-07T12:00:00.000Z",
        credentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          cancelUrl: "https://myinvois.test/cancel",
        },
      },
      business: {
        legalName: "Maboria Labs Sdn Bhd",
        taxId: "C2584563200",
        country: "MY",
        addressLine1: "Level 10, Jalan Sultan Ismail",
        city: "Kuala Lumpur",
        postalCode: "50250",
        email: "billing@maboria.com",
        phone: "+60312345678",
      },
      customer: {
        legalName: "Acme Digital Sdn Bhd",
        contactName: "Acme Digital Sdn Bhd",
        taxId: "C1234567890",
        country: "MY",
        addressLine1: "Jalan Ampang",
        city: "Kuala Lumpur",
        postalCode: "50450",
        email: "finance@acme.test",
        phone: "+60399999999",
      },
      items: [
        {
          name: "Growth plan",
          description: "Annual SaaS subscription",
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
      compliance: {
        sellerCountry: "MY",
        buyerCountry: "MY",
        requiresEInvoicing: true,
        supportLevel: "LIMITED",
        taxLabel: "SST",
        buyerType: "B2B",
        supplyType: "SAAS",
      },
    });

    assert.equal(malaysiaSubmission.snapshot.status, "SUBMITTED");
    assert.ok(malaysiaSubmission.payload, "expected a scaffold payload for supported providers");
    const malaysiaPayload = malaysiaSubmission.payload as any;
    assert.equal(malaysiaPayload.invoiceTypeCode, "01");
    assert.equal(malaysiaPayload.supplier?.legalName, "Maboria Labs Sdn Bhd");
    assert.equal(malaysiaPayload.buyer?.tin, "C1234567890");
    assert.equal(malaysiaPayload.lines?.[0]?.classificationCode, "022");
    assert.equal(malaysiaPayload.lines?.[0]?.unitCode, "EA");
    assert.equal(malaysiaPayload.lines?.[0]?.tax?.typeCode, "02");

    const malaysiaStatus = await getMyInvoisSubmissionStatus({
      connection: {
        provider: "MYINVOIS",
        country: "MY",
        status: "ACTIVE",
        sandbox: false,
        hasCredentials: true,
        lastValidatedAt: "2026-04-07T12:00:00.000Z",
        credentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          cancelUrl: "https://myinvois.test/cancel",
        },
      },
      submissionId: "SUB123456789",
    });
    assert.equal(malaysiaStatus.status, "ACCEPTED");
    assert.equal(malaysiaStatus.providerReference, "DOC123");

    const invalidMalaysiaSubmission = await submitEInvoiceDocument({
      invoiceNumber: "INV-MY-003",
      invoiceStatus: "DRAFT",
      sellerCountry: "MY",
      buyerCountry: "MY",
      currency: "MYR",
      connection: {
        provider: "MYINVOIS",
        country: "MY",
        status: "ACTIVE",
        sandbox: false,
        hasCredentials: true,
        lastValidatedAt: "2026-04-07T12:00:00.000Z",
        credentials: {
          clientId: "client-id",
          clientSecret: "client-secret",
          cancelUrl: "https://myinvois.test/cancel",
        },
      },
      business: {
        legalName: "Broken Co",
        country: "MY",
        addressLine1: "Jalan Salah",
        city: "Shah Alam",
        postalCode: "40A00",
        email: "bad email",
        phone: "123 456",
      },
      customer: {
        legalName: "Buyer Co",
        country: "MY",
        addressLine1: "Jalan Buyer",
        city: "Petaling Jaya",
        postalCode: "47810",
      },
      items: [{ name: "Service", quantity: 1, unitPrice: 100, lineTotal: 100 }],
      totals: {
        subtotal: 100,
        taxAmount: 0,
        discountAmount: 0,
        total: 100,
      },
      compliance: {
        sellerCountry: "MY",
        buyerCountry: "MY",
        requiresEInvoicing: true,
        supportLevel: "LIMITED",
        taxLabel: "SST",
        buyerType: "B2B",
        supplyType: "SERVICES",
      },
    });

    assert.equal(invalidMalaysiaSubmission.snapshot.status, "VALIDATION_FAILED");
    assert.match(String(invalidMalaysiaSubmission.snapshot.lastError || ""), /Supplier TIN is required/);

  } finally {
    global.fetch = originalFetch;
  }

  console.log("einvoicing scaffolding passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
