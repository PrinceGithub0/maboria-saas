import assert from "node:assert/strict";

import {
  buildDteFacturaElectronicaUrl,
  buildDtePortalUrl,
  buildDteSigningPreparation,
  buildDteTransmissionPreparation,
  getDteSubmissionStatus,
  getDteCredentials,
  submitDteDocument,
} from "@/lib/einvoicing/providers/dte-client";

async function main() {
  const credentials = getDteCredentials({
    provider: "CL_DTE",
    country: "CL",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      rut: "76012345-6",
      certificatePem: "CERT",
      privateKeyPem: "KEY",
      submissionUrl: "https://sii.example.test/submit",
      statusUrl: "https://sii.example.test/status",
    },
  });

  assert.equal(credentials.rut, "76012345-6");
  assert.equal(credentials.submissionUrl, "https://sii.example.test/submit");
  assert.equal(credentials.statusUrl, "https://sii.example.test/status");
  assert.equal(buildDtePortalUrl(), "https://www.sii.cl");
  assert.equal(buildDteFacturaElectronicaUrl(), "https://www.sii.cl/factura_electronica");

  const prep = buildDteSigningPreparation({
    provider: "CL_DTE",
    country: "CL",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      rut: "76012345-6",
      siiUser: "sii-user",
      siiPassword: "sii-password",
      certificatePem: "CERT",
      privateKeyPem: "KEY",
      submissionUrl: "https://sii.example.test/submit",
      statusUrl: "https://sii.example.test/status",
    },
  });

  assert.equal(prep.country, "CL");
  assert.equal(prep.presentArtifacts.includes("RUT"), true);
  assert.equal(prep.presentArtifacts.includes("submission URL"), true);
  assert.equal(prep.onboardingReady, true);
  assert.equal(prep.signingReady, true);
  assert.equal(prep.transmissionReady, true);
  assert.equal(prep.liveSubmissionReady, true);
  assert.equal(prep.liveSubmissionBlockedReason, null);
  assert.match(prep.notes.join(" "), /signed XML/i);

  const incompletePrep = buildDteTransmissionPreparation({
    provider: "CL_DTE",
    country: "CL",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: { rut: "76012345-6" },
  });

  assert.equal(incompletePrep.onboardingReady, false);
  assert.equal(incompletePrep.signingReady, false);
  assert.equal(incompletePrep.transmissionReady, false);
  assert.equal(incompletePrep.liveSubmissionReady, false);
  assert.ok(incompletePrep.missingArtifacts.includes("SII user"));
  assert.ok(incompletePrep.nextActions.some((action) => action.includes("SII user")));

  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "https://sii.example.test/submit") {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.provider, "CL_DTE");
      return new Response(JSON.stringify({ status: "AUTHORIZED", submissionId: "dte-123", trackId: "trk-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (String(input).startsWith("https://sii.example.test/status")) {
      return new Response(JSON.stringify({ status: "ACCEPTED", trackId: "trk-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch call: ${String(input)}`);
  }) as typeof fetch;

  try {
    const submission = await submitDteDocument({
      connection: {
        provider: "CL_DTE",
        country: "CL",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          rut: "76012345-6",
          submissionUrl: "https://sii.example.test/submit",
          statusUrl: "https://sii.example.test/status",
        },
      },
      payload: {
        externalId: "CL-2026-0003",
        format: "UBL_XML",
        payload: { invoiceNumber: "CL-2026-0003" },
        warnings: [],
      },
    });
    assert.equal(submission.status, "ACCEPTED");
    assert.equal(submission.submissionId, "dte-123");
    assert.equal(submission.providerReference, "trk-123");

    const status = await getDteSubmissionStatus({
      connection: {
        provider: "CL_DTE",
        country: "CL",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          rut: "76012345-6",
          submissionUrl: "https://sii.example.test/submit",
          statusUrl: "https://sii.example.test/status",
        },
      },
      submissionId: "dte-123",
    });
    assert.equal(status.status, "ACCEPTED");
    assert.equal(status.providerReference, "trk-123");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("einvoicing dte client passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
