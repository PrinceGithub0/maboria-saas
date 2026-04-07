import assert from "node:assert/strict";

import {
  buildDianFacturacionUrl,
  getDianSubmissionStatus,
  buildDianPortalUrl,
  buildDianOnboardingPreparation,
  getDianCredentials,
  submitDianDocument,
} from "@/lib/einvoicing/providers/dian-client";

async function main() {
  const credentials = getDianCredentials({
    provider: "CO_DIAN",
    country: "CO",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      nit: "900123456",
      softwareId: "SOFT-1",
      softwarePin: "PIN-1",
      submissionUrl: "https://dian.example.test/submit",
      statusUrl: "https://dian.example.test/status",
    },
  });

  assert.equal(credentials.nit, "900123456");
  assert.equal(credentials.submissionUrl, "https://dian.example.test/submit");
  assert.equal(credentials.statusUrl, "https://dian.example.test/status");
  assert.equal(buildDianPortalUrl(), "https://www.dian.gov.co");
  assert.equal(buildDianFacturacionUrl(), "https://www.dian.gov.co/impuestos/factura-electronica");

  const prep = buildDianOnboardingPreparation({
    provider: "CO_DIAN",
    country: "CO",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      nit: "900123456",
      softwareId: "SOFT-1",
      softwarePin: "PIN-1",
      certificatePem: "CERT",
      privateKeyPem: "KEY",
      submissionUrl: "https://dian.example.test/submit",
      statusUrl: "https://dian.example.test/status",
    },
  });

  assert.equal(prep.country, "CO");
  assert.equal(prep.presentArtifacts.includes("NIT"), true);
  assert.equal(prep.onboardingReady, true);
  assert.equal(prep.signingReady, true);
  assert.equal(prep.transmissionReady, true);
  assert.equal(prep.liveSubmissionReady, true);
  assert.equal(prep.liveSubmissionBlockedReason, null);
  assert.equal(prep.missingArtifacts.length, 0);

  const incompletePrep = buildDianOnboardingPreparation({
    provider: "CO_DIAN",
    country: "CO",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: { nit: "900123456" },
  });
  assert.equal(incompletePrep.liveSubmissionReady, false);
  assert.ok(incompletePrep.missingArtifacts.includes("software ID"));

  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "https://dian.example.test/submit") {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.provider, "CO_DIAN");
      assert.equal(body.softwareId, "SOFT-1");
      return new Response(JSON.stringify({ status: "AUTHORIZED", submissionId: "dian-123", cufe: "CUFE-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (String(input).startsWith("https://dian.example.test/status")) {
      return new Response(JSON.stringify({ status: "ACCEPTED", cufe: "CUFE-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch call: ${String(input)}`);
  }) as typeof fetch;

  try {
    const submission = await submitDianDocument({
      connection: {
        provider: "CO_DIAN",
        country: "CO",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          nit: "900123456",
          softwareId: "SOFT-1",
          submissionUrl: "https://dian.example.test/submit",
          statusUrl: "https://dian.example.test/status",
        },
      },
      payload: {
        externalId: "CO-2026-0004",
        format: "UBL_XML",
        payload: { invoiceNumber: "CO-2026-0004" },
        warnings: [],
      },
    });
    assert.equal(submission.status, "ACCEPTED");
    assert.equal(submission.submissionId, "dian-123");
    assert.equal(submission.providerReference, "CUFE-123");

    const status = await getDianSubmissionStatus({
      connection: {
        provider: "CO_DIAN",
        country: "CO",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          nit: "900123456",
          submissionUrl: "https://dian.example.test/submit",
          statusUrl: "https://dian.example.test/status",
        },
      },
      submissionId: "dian-123",
    });
    assert.equal(status.status, "ACCEPTED");
    assert.equal(status.providerReference, "CUFE-123");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("einvoicing dian client passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
