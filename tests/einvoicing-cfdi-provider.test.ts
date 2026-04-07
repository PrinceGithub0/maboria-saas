import assert from "node:assert/strict";

import { buildCfdiTransmissionPreparation } from "@/lib/einvoicing/providers/cfdi-client";
import { cfdiProvider } from "@/lib/einvoicing/providers/cfdi";

function buildContext(overrides: Record<string, unknown> = {}) {
  return {
    invoiceId: "inv-mx-001",
    invoiceNumber: "MX-2026-0007",
    invoiceStatus: "DRAFT",
    sellerCountry: "MX",
    buyerCountry: "MX",
    currency: "MXN",
    issuedAt: "2026-04-04T00:00:00.000Z",
    dueDate: "2026-04-18T00:00:00.000Z",
    business: {
      legalName: "Maboria Mexico SA de CV",
      taxId: "MXABC123456789",
      registrationNumber: "MEX-REG-001",
      branchCode: "001",
      country: "MX",
      addressLine1: "Avenida Reforma 100",
      addressLine2: "Piso 4",
      city: "Ciudad de Mexico",
      state: "CDMX",
      postalCode: "01000",
      email: "billing@maboria.test",
      phone: "+525500000000",
    },
    customer: {
      legalName: "Cliente Mexico SA",
      contactName: "Cliente Mexico SA",
      taxId: "MXCUST123456",
      registrationNumber: "CUST-001",
      country: "MX",
      addressLine1: "Calle Insurgentes 200",
      city: "Ciudad de Mexico",
      state: "CDMX",
      postalCode: "01010",
      email: "finance@cliente.test",
      phone: "+525500000001",
    },
    items: [
      {
        name: "Annual subscription",
        description: "SaaS access",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        taxAmount: 16,
        unitCode: "EA",
        classificationCode: "81112100",
        taxCategory: "002",
      },
    ],
    totals: {
      subtotal: 100,
      taxAmount: 16,
      discountAmount: 0,
      total: 116,
    },
    compliance: {
      sellerCountry: "MX",
      buyerCountry: "MX",
      requiresEInvoicing: true,
      supportLevel: "LIMITED",
      taxLabel: "VAT",
      buyerType: "B2B",
      supplyType: "SERVICES",
      taxTreatment: "STANDARD_TAX",
    },
    connection: {
      provider: "MX_CFDI",
      country: "MX",
      sandbox: true,
      status: "ACTIVE",
      hasCredentials: true,
      credentials: {
        rfc: "MXABC123456789",
        ciec: "CIEC-123",
        csdCertificatePem: "-----BEGIN CERTIFICATE-----",
        csdPrivateKeyPem: "-----BEGIN PRIVATE KEY-----",
        csdPrivateKeyPassword: "password-123",
        pacUrl: "https://pac.example.test/submit",
        pacStatusUrl: "https://pac.example.test/status",
      },
    },
    ...overrides,
  } as any;
}

async function main() {
  const prep = buildCfdiTransmissionPreparation(buildContext().connection);
  assert.equal(prep.country, "MX");
  assert.equal(prep.sandbox, true);
  assert.equal(prep.portalUrl.includes("sat.gob.mx"), true);
  assert.ok(prep.presentArtifacts.includes("RFC"));
  assert.ok(prep.presentArtifacts.includes("CSD certificate"));

  const built = await Promise.resolve(cfdiProvider.buildPayload(buildContext()));
  const payload = built.payload as any;

  assert.equal(built.externalId, "MX-2026-0007");
  assert.equal(payload.cfdiVersion, "4.0");
  assert.equal(payload.serie, "MX");
  assert.equal(payload.folio, "0007");
  assert.equal(payload.emisor.rfc, "MXABC123456789");
  assert.equal(payload.emisor.nombre, "Maboria Mexico SA de CV");
  assert.equal(payload.receptor.rfc, "MXCUST123456");
  assert.equal(payload.conceptos.length, 1);
  assert.equal(payload.conceptos[0].productServiceCode, "81112100");
  assert.equal(payload.impuestos.totalImpuestosTrasladados, 16);
  assert.equal(payload.transportDocument, null);
  assert.equal(payload.metadata.transportPreparation.country, "MX");
  assert.ok(built.warnings.some((warning) => warning.includes("PAC")));
  assert.ok(built.warnings.some((warning) => warning.includes("Stamped CFDI XML")));
  assert.ok(built.warnings.some((warning) => warning.includes("CFDI UUID")));

  const validation = await Promise.resolve(cfdiProvider.validatePayload(built, buildContext()));
  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.ok((validation.warnings || []).some((warning) => warning.includes("Stamped CFDI XML")));
    assert.ok((validation.warnings || []).some((warning) => warning.includes("CFDI UUID")));
  }

  const missingIdentity = await Promise.resolve(
    cfdiProvider.buildPayload(
      buildContext({
        business: {
          legalName: "Missing RFC SA de CV",
          addressLine1: "Avenida Falsa 1",
          city: "Guadalajara",
          postalCode: "44100",
          country: "MX",
        },
        customer: {
          legalName: "Cliente Sin RFC",
          addressLine1: "Calle 1",
          city: "Guadalajara",
          postalCode: "44100",
          country: "MX",
        },
      })
    )
  );
  assert.ok(missingIdentity.warnings.some((warning) => warning.includes("RFC")));

  const invalid = await Promise.resolve(
    cfdiProvider.validatePayload(
      {
        externalId: "MX-2026-0008",
        format: "UBL_XML",
        payload: {
          conceptos: [],
        },
        warnings: [],
      } as any,
      buildContext({
        business: {
          legalName: "",
          taxId: "",
          addressLine1: "",
          postalCode: "",
          country: "MX",
        },
        customer: {
          legalName: "",
          taxId: "",
          addressLine1: "",
          postalCode: "",
          country: "MX",
        },
        items: [],
      })
    )
  );
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.ok(invalid.errors.some((error) => error.includes("Supplier legal name")));
    assert.ok(invalid.errors.some((error) => error.includes("At least one concept line")));
  }

  assert.equal(typeof cfdiProvider.submit, "function");
  assert.equal(typeof cfdiProvider.getStatus, "function");
  assert.equal(typeof cfdiProvider.cancel, "function");

  console.log("einvoicing cfdi provider passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
