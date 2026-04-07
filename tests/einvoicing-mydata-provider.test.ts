import assert from "node:assert/strict";

import { myDataProvider } from "@/lib/einvoicing/providers/mydata";

function buildContext(overrides: Record<string, unknown> = {}) {
  return {
    invoiceId: "inv-001",
    invoiceNumber: "GR-2026-0001",
    invoiceStatus: "DRAFT",
    sellerCountry: "GR",
    buyerCountry: "GR",
    currency: "EUR",
    issuedAt: "2026-04-04T00:00:00.000Z",
    dueDate: "2026-04-11T00:00:00.000Z",
    business: {
      legalName: "Maboria Labs AE",
      taxId: "EL123456789",
      registrationNumber: "123456789",
      branchCode: "000",
      country: "GR",
      addressLine1: "Leof. Kifisias 1",
      city: "Athens",
      postalCode: "11523",
      email: "billing@maboria.test",
      phone: "+302100000000",
    },
    customer: {
      legalName: "Acme Hellas AE",
      contactName: "Acme Hellas AE",
      taxId: "EL987654321",
      registrationNumber: "987654321",
      country: "GR",
      addressLine1: "Syntagma 10",
      city: "Athens",
      postalCode: "10563",
      email: "finance@acme.test",
      phone: "+302100000001",
    },
    items: [
      {
        name: "Annual subscription",
        description: "SaaS access",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        taxAmount: 24,
        unitCode: "EA",
        classificationCode: "601",
        taxCategory: "1",
        incomeClassification: "E3_561_001",
      },
    ],
    totals: {
      subtotal: 100,
      taxAmount: 24,
      discountAmount: 0,
      total: 124,
    },
    compliance: {
      sellerCountry: "GR",
      buyerCountry: "GR",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      taxLabel: "VAT",
      buyerType: "B2B",
      supplyType: "SERVICES",
      taxTreatment: "STANDARD_TAX",
    },
    ...overrides,
  } as any;
}

async function main() {
  const built = await Promise.resolve(myDataProvider.buildPayload(buildContext()));
  assert.equal(built.externalId, "GR-2026-0001");
  assert.equal(built.format, "REPORTING");

  const invoice = (built.payload as any).invoicesDoc.invoice;
  assert.equal(invoice.invoiceHeader.series, "GR");
  assert.equal(invoice.invoiceHeader.aa, "0001");
  assert.equal(invoice.invoiceHeader.currency, "EUR");
  assert.equal(invoice.issuer.name, "Maboria Labs AE");
  assert.equal(invoice.counterpart.name, "Acme Hellas AE");
  assert.equal(invoice.invoiceDetails.length, 1);
  assert.equal(invoice.invoiceDetails[0].measurementUnit, "EA");
  assert.equal(invoice.invoiceDetails[0].incomeClassification, "E3_561_001");
  assert.equal(invoice.invoiceSummary.total, 124);

  const validation = await Promise.resolve(myDataProvider.validatePayload(built, buildContext()));
  assert.equal(validation.ok, true);
  assert.equal(validation.warnings?.length ?? 0, 0);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      assert.equal(url, "https://mydataapidev.aade.gr/SendInvoices");

      const headers = new Headers(init?.headers);
      assert.equal(headers.get("aade-user-id"), "aade-user");
      assert.equal(headers.get("ocp-apim-subscription-key"), "subscription-key");
      assert.equal(headers.get("content-type"), "application/json");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), built.payload);

      return new Response(JSON.stringify({ uid: "submission-123", mark: "MARK-123", status: "accepted" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const submitted = await myDataProvider.submit!(built, {
      ...buildContext(),
      connection: {
        provider: "MYDATA",
        country: "GR",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          aadeUserId: "aade-user",
          subscriptionKey: "subscription-key",
        },
      },
    });

    assert.equal(submitted.status, "ACCEPTED");
    assert.equal(submitted.submissionId, "MARK-123");
    assert.equal(submitted.providerReference, "submission-123");
    assert.equal(typeof myDataProvider.getStatus, "function");
    assert.equal(typeof myDataProvider.cancel, "function");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const missingClassification = await Promise.resolve(
    myDataProvider.buildPayload(
      buildContext({
        items: [
          {
            name: "Consulting",
            quantity: 1,
            unitPrice: 200,
            lineTotal: 200,
            taxAmount: 0,
          },
        ],
      })
    )
  );
  assert.equal(
    missingClassification.warnings.some((warning) => warning.includes("missing income classification mapping")),
    true
  );

  const invalid = await Promise.resolve(
    myDataProvider.validatePayload(
      {
        externalId: "GR-2026-0002",
        format: "REPORTING",
        payload: {
          invoicesDoc: {
            invoice: {
              invoiceHeader: {
                series: "",
                aa: "",
                issueDate: null,
                invoiceType: "1.1",
                currency: "EUR",
                correlatedInvoiceMark: null,
                specialInvoiceCategory: null,
              },
              issuer: {
                name: null,
                vatNumber: null,
                registrationNumber: null,
                branchCode: null,
                entityType: "issuer",
                address: {
                  street: null,
                  city: null,
                  postalCode: null,
                  region: null,
                  country: "GR",
                },
                contact: { email: null, phone: null },
              },
              counterpart: {
                name: null,
                vatNumber: null,
                registrationNumber: null,
                branchCode: null,
                entityType: "counterpart",
                address: {
                  street: null,
                  city: null,
                  postalCode: null,
                  region: null,
                  country: "GR",
                },
                contact: { email: null, phone: null },
              },
              invoiceDetails: [],
              invoiceSummary: {
                subtotal: 0,
                taxAmount: 0,
                discountAmount: 0,
                total: 0,
              },
              paymentMethods: [],
            },
          },
        },
        warnings: [],
      } as any,
      buildContext()
    )
  );
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes("series is required")));

  console.log("einvoicing mydata provider passed");
}

main();
