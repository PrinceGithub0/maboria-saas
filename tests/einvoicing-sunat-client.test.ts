import assert from "node:assert/strict";

import {
  buildSunatEFacturaUrl,
  buildSunatPortalUrl,
  buildSunatSigningPreparation,
  buildSunatSolUrl,
  getSunatSubmissionStatus,
  getSunatCredentials,
  submitSunatDocument,
} from "@/lib/einvoicing/providers/sunat-client";

async function main() {
  const credentials = getSunatCredentials({
    provider: "PE_SUNAT",
    country: "PE",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      ruc: "20123456789",
      solUser: "MODDATOS",
      solPassword: "sol-secret",
      submissionUrl: "https://sunat.example.test/submit",
      statusUrl: "https://sunat.example.test/status",
    },
  });

  assert.equal(credentials.ruc, "20123456789");
  assert.equal(credentials.submissionUrl, "https://sunat.example.test/submit");
  assert.equal(credentials.statusUrl, "https://sunat.example.test/status");
  assert.equal(buildSunatPortalUrl(), "https://www.sunat.gob.pe");
  assert.equal(buildSunatSolUrl(), "https://www.sunat.gob.pe/sol.html");
  assert.equal(buildSunatEFacturaUrl(), "https://cpe.sunat.gob.pe");

  const prep = buildSunatSigningPreparation({
    provider: "PE_SUNAT",
    country: "PE",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      ruc: "20123456789",
      solUser: "MODDATOS",
      solPassword: "sol-secret",
      certificatePem: "CERT",
      privateKeyPem: "KEY",
      submissionUrl: "https://sunat.example.test/submit",
      statusUrl: "https://sunat.example.test/status",
    },
  });

  assert.equal(prep.country, "PE");
  assert.equal(prep.presentArtifacts.includes("RUC"), true);
  assert.equal(prep.presentArtifacts.includes("submission URL"), true);
  assert.equal(prep.onboardingReady, true);
  assert.equal(prep.signingReady, true);
  assert.equal(prep.transmissionReady, true);
  assert.equal(prep.liveSubmissionReady, true);
  assert.equal(prep.liveSubmissionBlockedReason, null);
  assert.equal(prep.missingArtifacts.length, 0);

  const incompletePrep = buildSunatSigningPreparation({
    provider: "PE_SUNAT",
    country: "PE",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: { ruc: "20123456789" },
  });
  assert.equal(incompletePrep.liveSubmissionReady, false);
  assert.ok(incompletePrep.missingArtifacts.includes("SOL user"));

  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "https://sunat.example.test/submit") {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.provider, "PE_SUNAT");
      return new Response(JSON.stringify({ status: "AUTHORIZED", submissionId: "sunat-123", ticket: "ticket-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(input).startsWith("https://sunat.example.test/status")) {
      return new Response(JSON.stringify({ status: "ACCEPTED", ticket: "ticket-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call: ${String(input)}`);
  }) as typeof fetch;

  try {
    const submission = await submitSunatDocument({
      connection: {
        provider: "PE_SUNAT",
        country: "PE",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          ruc: "20123456789",
          submissionUrl: "https://sunat.example.test/submit",
          statusUrl: "https://sunat.example.test/status",
        },
      },
      payload: {
        externalId: "PE-2026-0005",
        format: "UBL_XML",
        payload: { invoiceNumber: "PE-2026-0005" },
        warnings: [],
      },
    });
    assert.equal(submission.status, "ACCEPTED");
    assert.equal(submission.submissionId, "sunat-123");
    assert.equal(submission.providerReference, "ticket-123");

    const status = await getSunatSubmissionStatus({
      connection: {
        provider: "PE_SUNAT",
        country: "PE",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          ruc: "20123456789",
          submissionUrl: "https://sunat.example.test/submit",
          statusUrl: "https://sunat.example.test/status",
        },
      },
      submissionId: "sunat-123",
    });
    assert.equal(status.status, "ACCEPTED");
    assert.equal(status.providerReference, "ticket-123");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("einvoicing sunat client passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
