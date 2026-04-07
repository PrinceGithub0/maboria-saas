
import assert from "node:assert/strict";

import {
  buildSdiAccreditationUrl,
  buildSdiGuidesUrl,
  buildSdiPortalUrl,
  buildSdiTransmissionPreparation,
  cancelSdiDocument,
  getSdiSubmissionStatus,
  getSdiCredentials,
  submitSdiDocument,
} from "@/lib/einvoicing/providers/sdi-client";

async function main() {
  const credentials = getSdiCredentials({
    provider: "IT_SDI",
    country: "IT",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      vatNumber: "IT12345678901",
      transmissionId: "TRASM-001",
      recipientCode: "ABC1234",
      pecEmail: "billing@example.it",
      certificatePem: "-----BEGIN CERTIFICATE-----",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----",
      submissionUrl: "https://sdi.example.test/submit",
      statusUrl: "https://sdi.example.test/status",
    },
  });

  assert.equal(credentials.vatNumber, "IT12345678901");
  assert.equal(credentials.transmissionId, "TRASM-001");
  assert.equal(credentials.recipientCode, "ABC1234");
  assert.equal(credentials.pecEmail, "billing@example.it");
  assert.equal(credentials.submissionUrl, "https://sdi.example.test/submit");
  assert.equal(credentials.statusUrl, "https://sdi.example.test/status");

  assert.throws(
    () =>
      getSdiCredentials({
        provider: "IT_SDI",
        country: "IT",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          transmissionId: "TRASM-001",
        },
      }),
    /requires a VAT number/
  );

  assert.equal(buildSdiPortalUrl(), "https://www.fatturapa.gov.it");
  assert.equal(buildSdiGuidesUrl(), "https://www.fatturapa.gov.it/it/fatturazione-elettronica/");
  assert.equal(
    buildSdiAccreditationUrl(),
    "https://www.fatturapa.gov.it/export/fatturazione/it/sdi/accreditare_canale.htm"
  );

  const prepared = buildSdiTransmissionPreparation({
    provider: "IT_SDI",
    country: "IT",
    status: "ACTIVE",
    sandbox: false,
    hasCredentials: true,
    credentials: {
      vatNumber: "IT12345678901",
      transmissionId: "TRASM-001",
      recipientCode: "ABC1234",
      certificatePem: "-----BEGIN CERTIFICATE-----",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----",
      submissionUrl: "https://sdi.example.test/submit",
      statusUrl: "https://sdi.example.test/status",
      cancelUrl: "https://sdi.example.test/cancel",
    },
  });

  assert.equal(prepared.country, "IT");
  assert.equal(prepared.onboardingReady, true);
  assert.equal(prepared.transmissionReady, true);
  assert.equal(prepared.productionReady, true);
  assert.equal(prepared.liveSubmissionReady, true);
  assert.equal(prepared.liveSubmissionBlockedReason, null);
  assert.equal(prepared.missingArtifacts.length, 0);
  assert.ok(prepared.nextActions.length === 0);

  const incomplete = buildSdiTransmissionPreparation({
    provider: "IT_SDI",
    country: "IT",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: false,
  });

  assert.equal(incomplete.onboardingReady, false);
  assert.ok(incomplete.missingArtifacts.includes("VAT number"));
  assert.ok(incomplete.nextActions.some((message) => message.includes("VAT number")));
  assert.equal(incomplete.liveSubmissionReady, false);

  const originalFetch = global.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url === "https://sdi.example.test/submit") {
      return new Response(JSON.stringify({ status: "submitted", submissionId: "SDI-123", receiptId: "RCPT-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.startsWith("https://sdi.example.test/status")) {
      return new Response(JSON.stringify({ status: "accepted", receiptId: "RCPT-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url === "https://sdi.example.test/cancel") {
      return new Response(JSON.stringify({ cancelled: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch call in SdI test: ${url}`);
  }) as typeof fetch;

  try {
    const submission = await submitSdiDocument({
      connection: {
        provider: "IT_SDI",
        country: "IT",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          vatNumber: "IT12345678901",
          transmissionId: "TRASM-001",
          recipientCode: "ABC1234",
          certificatePem: "-----BEGIN CERTIFICATE-----",
          privateKeyPem: "-----BEGIN PRIVATE KEY-----",
          submissionUrl: "https://sdi.example.test/submit",
          statusUrl: "https://sdi.example.test/status",
        },
      },
      payload: {
        externalId: "IT-INV-1",
        format: "UBL_XML",
        payload: { invoiceNumber: "IT-INV-1" },
        warnings: [],
      },
    });

    assert.equal(submission.status, "SUBMITTED");
    assert.equal(submission.submissionId, "SDI-123");
    assert.equal(submission.providerReference, "RCPT-1");
    assert.equal(calls[0]?.init?.method, "POST");

    const status = await getSdiSubmissionStatus({
      connection: {
        provider: "IT_SDI",
        country: "IT",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          vatNumber: "IT12345678901",
          submissionUrl: "https://sdi.example.test/submit",
          statusUrl: "https://sdi.example.test/status",
        },
      },
      submissionId: "SDI-123",
    });

    assert.equal(status.status, "ACCEPTED");
    assert.equal(status.providerReference, "RCPT-1");

    const cancellation = await cancelSdiDocument({
      connection: {
        provider: "IT_SDI",
        country: "IT",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          vatNumber: "IT12345678901",
          submissionUrl: "https://sdi.example.test/submit",
          cancelUrl: "https://sdi.example.test/cancel",
        },
      },
      submissionId: "SDI-123",
    });

    assert.equal(cancellation.status, "CANCELLED");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("einvoicing sdi client passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
