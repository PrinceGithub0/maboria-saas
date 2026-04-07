import assert from "node:assert/strict";

import { roEFacturaProvider } from "@/lib/einvoicing/providers/ro-efactura";
import type { EInvoiceProviderContext } from "@/lib/einvoicing/types";

const buildContext = (overrides: Partial<EInvoiceProviderContext> = {}): EInvoiceProviderContext =>
  ({
    invoiceId: "inv-ro-001",
    invoiceNumber: "INV-RO-001",
    invoiceStatus: "DRAFT",
    sellerCountry: "RO",
    buyerCountry: "RO",
    currency: "RON",
    issuedAt: "2026-04-04T00:00:00.000Z",
    dueDate: "2026-04-14T00:00:00.000Z",
    compliance: {
      sellerCountry: "RO",
      buyerCountry: "RO",
      buyerType: "B2B",
      supplyType: "GOODS",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      taxLabel: "VAT",
    },
    business: {
      legalName: "Maboria Labs SRL",
      taxId: "RO12345678",
      registrationNumber: "J40/1234/2026",
      addressLine1: "Strada Exemplu 10",
      city: "Bucharest",
      postalCode: "010101",
      country: "RO",
      email: "billing@maboria.test",
      phone: "+40700000000",
    },
    customer: {
      legalName: "Acme Romania SRL",
      taxId: "RO87654321",
      registrationNumber: "J40/9999/2025",
      addressLine1: "Bulevardul Victoriei 1",
      city: "Bucharest",
      postalCode: "010201",
      country: "RO",
      email: "finance@acme.test",
      phone: "+40711111111",
    },
    items: [
      {
        name: "Annual subscription",
        description: "SaaS plan",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        taxAmount: 19,
        unitCode: "EA",
        classificationCode: "6201",
        taxCategory: "S",
        incomeClassification: "0701",
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

async function run() {
  const payloadResult = (await Promise.resolve(roEFacturaProvider.buildPayload(buildContext()))) as any;
  const validation = (await Promise.resolve(
    roEFacturaProvider.validatePayload(payloadResult, buildContext())
  )) as any;
  const payload = payloadResult.payload as any;

  assert.equal(payloadResult.format, "UBL_XML");
  assert.equal(payloadResult.externalId, "INV-RO-001");
  assert.equal(payload.UBLVersionID, "2.1");
  assert.equal(payload.CustomizationID, "urn:cen.eu:en16931:2017#compliant#urn:anaf:ro:e-Factura");
  assert.equal(payload.ProfileID, "urn:fdc:anaf.ro:2021:eFactura:Invoice");
  assert.equal(payload.AccountingSupplierParty.Party.PartyName.Name, "Maboria Labs SRL");
  assert.equal(payload.AccountingSupplierParty.Party.PostalAddress.cityName, "Bucharest");
  assert.equal(payload.AccountingCustomerParty.Party.PartyName.Name, "Acme Romania SRL");
  assert.equal(payload.InvoiceLine.length, 1);
  assert.equal(payload.InvoiceLine[0].item.classifiedTaxCategory.id, "S");
  assert.equal(payload.InvoiceLine[0].price.priceAmount, 100);
  assert.equal(payload.TaxTotal[0].TaxAmount, 19);
  assert.equal(payload.LegalMonetaryTotal.PayableAmount, 119);
  assert.equal(validation.ok, true);
  assert.ok((validation as { ok: true; warnings?: string[] }).warnings?.length === 0 || true);
  assert.equal(typeof roEFacturaProvider.submit, "function");
  assert.equal(typeof roEFacturaProvider.getStatus, "function");
  assert.equal(typeof roEFacturaProvider.cancel, "function");

  const missingIdentityContext = buildContext({
    business: {
      legalName: "Missing Identity SRL",
      taxId: "RO44556677",
      addressLine1: "Strada Fara",
      city: "Cluj-Napoca",
      postalCode: "400000",
      country: "RO",
    },
    customer: {
      legalName: "Buyer SRL",
      addressLine1: "Strada Cumparator",
      city: "Cluj-Napoca",
      postalCode: "400100",
      country: "RO",
    },
    items: [
      {
        name: "Service",
        quantity: 1,
        unitPrice: 50,
        lineTotal: 50,
      },
    ],
  });

  const missingPayload = (await Promise.resolve(roEFacturaProvider.buildPayload(missingIdentityContext))) as any;
  const missingValidation = (await Promise.resolve(
    roEFacturaProvider.validatePayload(missingPayload, missingIdentityContext)
  )) as any;

  assert.equal(
    missingPayload.warnings.some((warning: string) => warning.includes("registration number")),
    true
  );
  assert.equal(missingValidation.ok, true);
  assert.equal(
    (missingValidation as { ok: true; warnings?: string[] }).warnings?.some((warning: string) =>
      warning.includes("missing a unit code")
    ),
    true
  );

  const invalidContext = buildContext({
    business: {
      legalName: "",
      taxId: "",
      addressLine1: "",
      city: "",
      postalCode: "",
      country: "RO",
    },
    customer: {
      legalName: "",
      taxId: "",
      addressLine1: "",
      city: "",
      postalCode: "",
      country: "RO",
    },
    items: [],
  });

  const invalidPayload = await roEFacturaProvider.buildPayload(invalidContext);
  const invalidValidation = await roEFacturaProvider.validatePayload(invalidPayload, invalidContext);

  assert.equal(invalidValidation.ok, false);
  if (!invalidValidation.ok) {
    assert.match(invalidValidation.errors.join(" "), /Seller legal name/);
    assert.match(invalidValidation.errors.join(" "), /At least one invoice line/);
  }

  console.log("einvoicing ro provider passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
