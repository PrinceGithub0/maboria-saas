
import assert from "node:assert/strict";

import {
  buildNavApiDocsUrl,
  buildNavOnlineInvoiceUrl,
  buildNavPortalUrl,
  getNavOnlineInvoiceStatus,
  buildNavReportingPreparation,
  getNavOnlineInvoiceCredentials,
  submitNavOnlineInvoiceReport,
} from "@/lib/einvoicing/providers/nav-online-invoice-client";

async function main() {
  const credentials = getNavOnlineInvoiceCredentials({
    provider: "HU_NAV",
    country: "HU",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      taxNumber: "12345678",
      technicalUserName: "TECHUSER",
      technicalUserPassword: "TECHPASS",
      signingKey: "SIGNKEY",
      exchangeKey: "EXCHANGEKEY",
      submissionUrl: "https://nav.example.test/submit",
      statusUrl: "https://nav.example.test/status",
    },
  });

  assert.equal(credentials.taxNumber, "12345678");
  assert.equal(credentials.submissionUrl, "https://nav.example.test/submit");
  assert.equal(credentials.statusUrl, "https://nav.example.test/status");
  assert.equal(buildNavPortalUrl(), "https://nav.gov.hu");
  assert.equal(buildNavOnlineInvoiceUrl(), "https://nav.gov.hu/ugyfeliranytu/nezzen-utana/inf_fuz");
  assert.equal(
    buildNavApiDocsUrl(),
    "https://nav.gov.hu/pfile/file?path=/szamlainfo/online-szamla-api-dokumentacio"
  );

  const prep = buildNavReportingPreparation({
    provider: "HU_NAV",
    country: "HU",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      taxNumber: "12345678",
      technicalUserName: "TECHUSER",
      technicalUserPassword: "TECHPASS",
      signingKey: "SIGNKEY",
      exchangeKey: "EXCHANGEKEY",
      submissionUrl: "https://nav.example.test/submit",
      statusUrl: "https://nav.example.test/status",
    },
  });

  assert.equal(prep.country, "HU");
  assert.equal(prep.presentArtifacts.includes("tax number"), true);
  assert.equal(prep.presentArtifacts.includes("submission URL"), true);
  assert.equal(prep.onboardingReady, true);
  assert.equal(prep.signingReady, true);
  assert.equal(prep.transmissionReady, true);
  assert.equal(prep.liveSubmissionReady, true);
  assert.equal(prep.liveSubmissionBlockedReason, null);
  assert.equal(prep.missingArtifacts.length, 0);

  const incompletePrep = buildNavReportingPreparation({
    provider: "HU_NAV",
    country: "HU",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: { taxNumber: "12345678" },
  });
  assert.equal(incompletePrep.liveSubmissionReady, false);
  assert.ok(incompletePrep.missingArtifacts.includes("technical user"));

  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "https://nav.example.test/submit") {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.provider, "HU_NAV");
      return new Response(JSON.stringify({ status: "SUCCESS", submissionId: "nav-123", transactionId: "txn-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(input).startsWith("https://nav.example.test/status")) {
      return new Response(JSON.stringify({ status: "ACCEPTED", transactionId: "txn-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call: ${String(input)}`);
  }) as typeof fetch;

  try {
    const submission = await submitNavOnlineInvoiceReport({
      connection: {
        provider: "HU_NAV",
        country: "HU",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          taxNumber: "12345678",
          submissionUrl: "https://nav.example.test/submit",
          statusUrl: "https://nav.example.test/status",
        },
      },
      payload: {
        externalId: "HU-2026-0006",
        format: "REPORTING",
        payload: { invoiceNumber: "HU-2026-0006" },
        warnings: [],
      },
    });
    assert.equal(submission.status, "ACCEPTED");
    assert.equal(submission.submissionId, "nav-123");
    assert.equal(submission.providerReference, "txn-123");

    const status = await getNavOnlineInvoiceStatus({
      connection: {
        provider: "HU_NAV",
        country: "HU",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          taxNumber: "12345678",
          submissionUrl: "https://nav.example.test/submit",
          statusUrl: "https://nav.example.test/status",
        },
      },
      submissionId: "nav-123",
    });
    assert.equal(status.status, "ACCEPTED");
    assert.equal(status.providerReference, "txn-123");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("einvoicing nav online invoice client passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
