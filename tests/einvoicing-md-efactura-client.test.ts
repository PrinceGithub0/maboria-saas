
import assert from "node:assert/strict";

import {
  buildMdEFacturaPreparation,
  buildMdEFacturaUrl,
  getMdEFacturaStatus,
  buildMdMPassUrl,
  buildMdSfsPortalUrl,
  getMdEFacturaCredentials,
  submitMdEFacturaDocument,
} from "@/lib/einvoicing/providers/md-efactura-client";

async function main() {
  const credentials = getMdEFacturaCredentials({
    provider: "MD_EFACTURA",
    country: "MD",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      taxpayerCode: "1002600000000",
      username: "sfs-user",
      password: "sfs-pass",
      certificatePem: "CERT",
      privateKeyPem: "KEY",
      submissionUrl: "https://md.example.test/submit",
      statusUrl: "https://md.example.test/status",
    },
  });

  assert.equal(credentials.taxpayerCode, "1002600000000");
  assert.equal(credentials.submissionUrl, "https://md.example.test/submit");
  assert.equal(credentials.statusUrl, "https://md.example.test/status");
  assert.equal(buildMdSfsPortalUrl(), "https://sfs.md");
  assert.equal(buildMdEFacturaUrl(), "https://sfs.md/ro/stiri/in-atentia-utilizatorilor-sia-e-factura");
  assert.equal(buildMdMPassUrl(), "https://mpass.gov.md");

  const prep = buildMdEFacturaPreparation({
    provider: "MD_EFACTURA",
    country: "MD",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      taxpayerCode: "1002600000000",
      username: "sfs-user",
      password: "sfs-pass",
      certificatePem: "CERT",
      privateKeyPem: "KEY",
      submissionUrl: "https://md.example.test/submit",
      statusUrl: "https://md.example.test/status",
    },
  });

  assert.equal(prep.country, "MD");
  assert.equal(prep.presentArtifacts.includes("taxpayer code"), true);
  assert.equal(prep.presentArtifacts.includes("submission URL"), true);
  assert.equal(prep.onboardingReady, true);
  assert.equal(prep.signingReady, true);
  assert.equal(prep.transmissionReady, true);
  assert.equal(prep.liveSubmissionReady, true);
  assert.equal(prep.liveSubmissionBlockedReason, null);
  assert.equal(prep.missingArtifacts.length, 0);

  const incompletePrep = buildMdEFacturaPreparation({
    provider: "MD_EFACTURA",
    country: "MD",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: { taxpayerCode: "1002600000000" },
  });
  assert.equal(incompletePrep.liveSubmissionReady, false);
  assert.ok(incompletePrep.missingArtifacts.includes("username"));

  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "https://md.example.test/submit") {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.provider, "MD_EFACTURA");
      return new Response(JSON.stringify({ status: "AUTHORIZED", submissionId: "md-123", requestId: "req-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(input).startsWith("https://md.example.test/status")) {
      return new Response(JSON.stringify({ status: "ACCEPTED", requestId: "req-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call: ${String(input)}`);
  }) as typeof fetch;

  try {
    const submission = await submitMdEFacturaDocument({
      connection: {
        provider: "MD_EFACTURA",
        country: "MD",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          taxpayerCode: "1002600000000",
          submissionUrl: "https://md.example.test/submit",
          statusUrl: "https://md.example.test/status",
        },
      },
      payload: {
        externalId: "MD-2026-0007",
        format: "UBL_XML",
        payload: { invoiceNumber: "MD-2026-0007" },
        warnings: [],
      },
    });
    assert.equal(submission.status, "ACCEPTED");
    assert.equal(submission.submissionId, "md-123");
    assert.equal(submission.providerReference, "req-123");

    const status = await getMdEFacturaStatus({
      connection: {
        provider: "MD_EFACTURA",
        country: "MD",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          taxpayerCode: "1002600000000",
          submissionUrl: "https://md.example.test/submit",
          statusUrl: "https://md.example.test/status",
        },
      },
      submissionId: "md-123",
    });
    assert.equal(status.status, "ACCEPTED");
    assert.equal(status.providerReference, "req-123");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("einvoicing md efactura client passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
