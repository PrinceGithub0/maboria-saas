import assert from "node:assert/strict";

import {
  buildZatcaComplianceSandboxUrl,
  buildZatcaClearanceApiUrl,
  cancelZatcaInvoice,
  buildZatcaDeveloperPortalUrl,
  buildZatcaEducationalLibraryUrl,
  buildZatcaFatooraPortalUrl,
  buildZatcaIntegrationSandboxUrl,
  buildZatcaOnboardingUrl,
  buildZatcaProductionPortalUrl,
  buildZatcaReportingApiUrl,
  buildZatcaSandboxRootUrl,
  buildZatcaSecurityRequirementsUrl,
  getZatcaSubmissionStatus,
  buildZatcaTransportPreparation,
  buildZatcaSigningPreparation,
  getZatcaCredentials,
  submitZatcaInvoice,
} from "@/lib/einvoicing/providers/zatca-client";
import { zatcaProvider } from "@/lib/einvoicing/providers/zatca";

function runStaticChecks() {
  const credentials = getZatcaCredentials({
    provider: "ZATCA",
    country: "SA",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      tin: "300123456700003",
      portalUsername: "sa-taxpayer",
      portalPassword: "portal-secret",
      otp: "123456",
      csr: "-----BEGIN CSR-----",
      csid: "CSID-001",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----",
      certificatePem: "-----BEGIN CERTIFICATE-----",
      binarySecurityToken: "BST-001",
      binarySecurityTokenSecret: "BST-SECRET",
      complianceRequestId: "REQ-001",
      egsSerialNumber: "EGS-123",
      statusUrl: "https://zatca-status.example.test/status",
    },
  });

  assert.equal(credentials.tin, "300123456700003");
  assert.equal(credentials.portalUsername, "sa-taxpayer");
  assert.equal(credentials.portalPassword, "portal-secret");
  assert.equal(credentials.otp, "123456");
  assert.equal(credentials.csr, "-----BEGIN CSR-----");
  assert.equal(credentials.csid, "CSID-001");
  assert.equal(credentials.privateKeyPem, "-----BEGIN PRIVATE KEY-----");
  assert.equal(credentials.certificatePem, "-----BEGIN CERTIFICATE-----");
  assert.equal(credentials.binarySecurityToken, "BST-001");
  assert.equal(credentials.binarySecurityTokenSecret, "BST-SECRET");
  assert.equal(credentials.complianceRequestId, "REQ-001");
  assert.equal(credentials.egsSerialNumber, "EGS-123");
  assert.equal(credentials.statusUrl, "https://zatca-status.example.test/status");

  assert.throws(
    () =>
      getZatcaCredentials({
        provider: "ZATCA",
        country: "SA",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          portalUsername: "sa-taxpayer",
        },
      }),
    /requires a TIN/
  );

  assert.equal(buildZatcaFatooraPortalUrl(), "https://fatoora.zatca.gov.sa");
  assert.equal(
    buildZatcaDeveloperPortalUrl(),
    "https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Pages/default.aspx"
  );
  assert.equal(
    buildZatcaEducationalLibraryUrl(),
    "https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines"
  );
  assert.equal(
    buildZatcaSecurityRequirementsUrl(),
    "https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/Security-Requirements.aspx"
  );
  assert.equal(buildZatcaOnboardingUrl(), "https://fatoora.zatca.gov.sa/onboard-solution");
  assert.equal(buildZatcaSandboxRootUrl(), "https://sandbox.zatca.gov.sa");
  assert.equal(
    buildZatcaIntegrationSandboxUrl("IntegrationSandbox/preInvoice-api"),
    "https://sandbox.zatca.gov.sa/IntegrationSandbox/preInvoice-api"
  );
  assert.equal(
    buildZatcaComplianceSandboxUrl("/Compliance"),
    "https://sandbox.zatca.gov.sa/Compliance"
  );
  assert.equal(
    buildZatcaReportingApiUrl({ sandbox: true }),
    "https://sandbox.zatca.gov.sa/IntegrationSandbox/invoices/reporting/single"
  );
  assert.equal(
    buildZatcaClearanceApiUrl({ sandbox: true }),
    "https://sandbox.zatca.gov.sa/IntegrationSandbox/invoices/clearance/single"
  );
  assert.equal(
    buildZatcaProductionPortalUrl(),
    "https://zatca.gov.sa/en/login/Pages/login.aspx"
  );

  const prep = buildZatcaSigningPreparation({
    provider: "ZATCA",
    country: "SA",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      tin: "300123456700003",
      portalUsername: "sa-taxpayer",
      portalPassword: "portal-secret",
      otp: "123456",
      csr: "-----BEGIN CSR-----",
      csid: "CSID-001",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----",
      certificatePem: "-----BEGIN CERTIFICATE-----",
      binarySecurityToken: "BST-001",
      binarySecurityTokenSecret: "BST-SECRET",
    },
  });

  assert.equal(prep.country, "SA");
  assert.equal(prep.sandbox, true);
  assert.equal(prep.portalUrl, "https://fatoora.zatca.gov.sa");
  assert.equal(prep.onboardingUrl, "https://fatoora.zatca.gov.sa/onboard-solution");
  assert.equal(prep.requiredArtifacts.includes("TIN"), true);
  assert.equal(prep.requiredArtifacts.includes("CSR"), true);
  assert.equal(prep.presentArtifacts.includes("TIN"), true);
  assert.equal(prep.presentArtifacts.includes("OTP"), true);
  assert.equal(prep.onboardingReady, true);
  assert.equal(prep.clearanceReady, true);
  assert.equal(prep.operationalReady, false);
  assert.equal(prep.liveSubmissionReady, false);
  assert.match(prep.liveSubmissionBlockedReason || "", /requires onboarding/i);
  assert.equal(prep.missingArtifacts.length, 0);
  assert.match(prep.productionAccessRequirement, /ERAD/);
  assert.equal(prep.notes.length >= 3, true);

  const transportPrep = buildZatcaTransportPreparation({
    provider: "ZATCA",
    country: "SA",
    status: "ACTIVE",
    sandbox: false,
    hasCredentials: true,
    credentials: {
      tin: "300123456700003",
      portalUsername: "sa-taxpayer",
      portalPassword: "portal-secret",
      otp: "123456",
      csr: "-----BEGIN CSR-----",
      csid: "CSID-001",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----",
      certificatePem: "-----BEGIN CERTIFICATE-----",
      binarySecurityToken: "BST-001",
      binarySecurityTokenSecret: "BST-SECRET",
      complianceRequestId: "REQ-001",
      egsSerialNumber: "EGS-123",
    },
  });

  assert.equal(transportPrep.sandbox, false);
  assert.equal(transportPrep.onboardingReady, true);
  assert.equal(transportPrep.clearanceReady, true);
  assert.equal(transportPrep.operationalReady, true);
  assert.equal(transportPrep.liveSubmissionReady, true);
  assert.equal(transportPrep.liveSubmissionBlockedReason, null);
  assert.equal(transportPrep.missingArtifacts.length, 0);
  assert.ok(transportPrep.notes.some((message) => /Live ZATCA submission is available/i.test(message)));

  const blockedValidation = zatcaProvider.validatePayload(
    {
      externalId: "SA-INV-1",
      format: "UBL_XML",
      payload: {},
      warnings: [],
    },
    {
      invoiceId: "invoice-sa-1",
      invoiceNumber: "SA-INV-1",
      sellerCountry: "SA",
      buyerCountry: "SA",
      currency: "SAR",
      issuedAt: "2026-04-04",
      connection: {
        provider: "ZATCA",
        country: "SA",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          portalUsername: "sa-taxpayer",
        },
      },
      business: {
        legalName: "Saudi Seller LLC",
        taxId: "300123456700003",
        addressLine1: "King Fahd Road",
        city: "Riyadh",
        country: "SA",
      },
      customer: {
        legalName: "Buyer Co",
        country: "SA",
      },
      items: [
        {
          name: "Service",
          quantity: 1,
          unitPrice: 100,
        },
      ],
      totals: {
        subtotal: 100,
        taxAmount: 15,
        discountAmount: 0,
        total: 115,
      },
    }
  ) as { ok: boolean; errors?: string[]; warnings?: string[] };

  assert.equal(blockedValidation.ok, false);
  assert.ok((blockedValidation.errors || []).some((message: string) => /onboarding prerequisites/i.test(message)));

  const signedDocWarnings = zatcaProvider.validatePayload(
    {
      externalId: "SA-INV-2",
      format: "UBL_XML",
      payload: {},
      warnings: [],
    },
    {
      invoiceId: "invoice-sa-2",
      invoiceNumber: "SA-INV-2",
      sellerCountry: "SA",
      buyerCountry: "SA",
      currency: "SAR",
      issuedAt: "2026-04-04",
      connection: {
        provider: "ZATCA",
        country: "SA",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          tin: "300123456700003",
          portalUsername: "sa-taxpayer",
          portalPassword: "portal-secret",
          otp: "123456",
          csr: "-----BEGIN CSR-----",
          csid: "CSID-001",
          privateKeyPem: "-----BEGIN PRIVATE KEY-----",
          certificatePem: "-----BEGIN CERTIFICATE-----",
          binarySecurityToken: "BST-001",
          binarySecurityTokenSecret: "BST-SECRET",
          complianceRequestId: "REQ-001",
          egsSerialNumber: "EGS-123",
        },
      },
      business: {
        legalName: "Saudi Seller LLC",
        taxId: "300123456700003",
        addressLine1: "King Fahd Road",
        city: "Riyadh",
        country: "SA",
      },
      customer: {
        legalName: "Buyer Co",
        taxId: "300765432100003",
        country: "SA",
      },
      items: [
        {
          name: "Service",
          quantity: 1,
          unitPrice: 100,
          unitCode: "EA",
          classificationCode: "81112100",
          taxCategory: "VAT",
        },
      ],
      totals: {
        subtotal: 100,
        taxAmount: 15,
        discountAmount: 0,
        total: 115,
      },
      compliance: {
        buyerType: "B2B",
        supplyType: "SERVICES",
        taxTreatment: "STANDARD_TAX",
      },
    }
  ) as { ok: boolean; warnings?: string[] };

  assert.equal(signedDocWarnings.ok, true);
  assert.ok((signedDocWarnings.warnings || []).some((message: string) => /signed zatca invoice xml/i.test(message)));

  const warningSummary = (zatcaProvider.buildWarnings?.({
    invoiceId: "invoice-sa-1",
    sellerCountry: "SA",
    buyerCountry: "SA",
    currency: "SAR",
    connection: {
      provider: "ZATCA",
      country: "SA",
      status: "ACTIVE",
      sandbox: true,
      hasCredentials: true,
      credentials: {
        tin: "300123456700003",
      },
    },
  }) ?? []) as string[];

  assert.ok(warningSummary.some((message) => /ZATCA/i.test(message)));
}

async function runFetchChecks() {
  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/invoices/reporting/single")) {
      assert.equal(init?.method, "POST");
      return new Response(
        JSON.stringify({ reportingStatus: "REPORTED", uuid: "UUID-SA-1" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.startsWith("https://zatca-status.example.test/status")) {
      assert.equal(init?.method, "GET");
      return new Response(
        JSON.stringify({ status: "ACCEPTED", uuid: "UUID-SA-1" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url === "https://zatca-cancel.example.test/cancel") {
      assert.equal(init?.method, "POST");
      return new Response(JSON.stringify({ cancelled: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  }) as typeof fetch;

  try {
    const submission = await submitZatcaInvoice({
      connection: {
        provider: "ZATCA",
        country: "SA",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          tin: "300123456700003",
          portalUsername: "sa-taxpayer",
          portalPassword: "portal-secret",
          otp: "123456",
          csr: "-----BEGIN CSR-----",
          csid: "CSID-001",
          privateKeyPem: "-----BEGIN PRIVATE KEY-----",
          certificatePem: "-----BEGIN CERTIFICATE-----",
          binarySecurityToken: "BST-001",
          binarySecurityTokenSecret: "BST-SECRET",
          complianceRequestId: "REQ-001",
          egsSerialNumber: "EGS-123",
          statusUrl: "https://zatca-status.example.test/status",
        },
      },
      payload: {
        externalId: "SA-INV-3",
        format: "UBL_XML",
        payload: {
          submissionMode: "REPORTING",
          transportDocument: {
            mode: "REPORTING",
            invoiceHash: "hash-123",
            uuid: "UUID-SA-1",
            documentBase64: "base64-xml",
          },
        },
        warnings: [],
      },
    });

    assert.equal(submission.status, "ACCEPTED");
    assert.equal(submission.submissionId, "UUID-SA-1");
    assert.equal(submission.providerReference, "REPORTED");

    const status = await getZatcaSubmissionStatus({
      connection: {
        provider: "ZATCA",
        country: "SA",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          tin: "300123456700003",
          binarySecurityToken: "BST-001",
          binarySecurityTokenSecret: "BST-SECRET",
          statusUrl: "https://zatca-status.example.test/status",
        },
      },
      submissionId: "UUID-SA-1",
    });
    assert.equal(status.status, "ACCEPTED");
    assert.equal(status.providerReference, "UUID-SA-1");
    const cancellation = await cancelZatcaInvoice({
      connection: {
        provider: "ZATCA",
        country: "SA",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          tin: "300123456700003",
          binarySecurityToken: "BST-001",
          binarySecurityTokenSecret: "BST-SECRET",
          cancelUrl: "https://zatca-cancel.example.test/cancel",
        },
      },
      submissionId: "UUID-SA-1",
    });
    assert.equal(cancellation.status, "CANCELLED");
    assert.equal(typeof zatcaProvider.getStatus, "function");
    assert.equal(typeof zatcaProvider.cancel, "function");
  } finally {
    global.fetch = originalFetch;
  }
}

async function main() {
  runStaticChecks();
  await runFetchChecks();
  console.log("einvoicing zatca client passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
