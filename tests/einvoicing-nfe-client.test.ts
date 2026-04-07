import assert from "node:assert/strict";

import {
  buildNfeConsultaUrl,
  buildNfeGuideUrl,
  buildNfePortalUrl,
  buildNfeSigningPreparation,
  buildNfeTransmissionPreparation,
  getNfeSubmissionStatus,
  getNfeCredentials,
  submitNfeDocument,
} from "@/lib/einvoicing/providers/nfe-client";

async function runStaticChecks() {
  const credentials = getNfeCredentials({
    provider: "BR_NFE",
    country: "BR",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      cnpj: "12345678000199",
      certificatePem: "-----BEGIN CERTIFICATE-----",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----",
      certificatePassword: "secret",
      uf: "sp",
      submissionUrl: "https://sefaz.example.test/submit",
      statusUrl: "https://sefaz.example.test/status",
    },
  });

  assert.equal(credentials.cnpj, "12345678000199");
  assert.equal(credentials.certificatePem, "-----BEGIN CERTIFICATE-----");
  assert.equal(credentials.privateKeyPem, "-----BEGIN PRIVATE KEY-----");
  assert.equal(credentials.certificatePassword, "secret");
  assert.equal(credentials.uf, "SP");
  assert.equal(credentials.submissionUrl, "https://sefaz.example.test/submit");
  assert.equal(credentials.statusUrl, "https://sefaz.example.test/status");

  assert.throws(
    () =>
      getNfeCredentials({
        provider: "BR_NFE",
        country: "BR",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          certificatePem: "-----BEGIN CERTIFICATE-----",
        },
      }),
    /requires a CNPJ/
  );

  assert.equal(buildNfePortalUrl(), "https://www.nfe.fazenda.gov.br");
  assert.equal(buildNfeGuideUrl(), "https://www.nfe.fazenda.gov.br/portal");
  assert.equal(buildNfeConsultaUrl(), "https://www.nfe.fazenda.gov.br/portal/consulta.aspx");

  const prep = buildNfeTransmissionPreparation({
    provider: "BR_NFE",
    country: "BR",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      cnpj: "12345678000199",
      certificatePem: "-----BEGIN CERTIFICATE-----",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----",
      certificatePassword: "secret",
      uf: "SP",
      submissionUrl: "https://sefaz.example.test/submit",
      statusUrl: "https://sefaz.example.test/status",
    },
  });

  assert.equal(prep.country, "BR");
  assert.equal(prep.sandbox, true);
  assert.equal(prep.onboardingReady, true);
  assert.equal(prep.signingReady, true);
  assert.equal(prep.transmissionReady, true);
  assert.equal(prep.liveSubmissionReady, true);
  assert.equal(prep.liveSubmissionBlockedReason, null);
  assert.equal(prep.missingArtifacts.length, 0);
  assert.equal(prep.presentArtifacts.includes("CNPJ"), true);
  assert.equal(prep.presentArtifacts.includes("certificate"), true);
  assert.equal(prep.presentArtifacts.includes("private key"), true);
  assert.equal(prep.presentArtifacts.includes("UF:SP"), true);
  assert.equal(prep.presentArtifacts.includes("submission URL"), true);
  assert.match(prep.notes.join(" "), /signed XML/);

  const incompletePrep = buildNfeSigningPreparation({
    provider: "BR_NFE",
    country: "BR",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      cnpj: "12345678000199",
      uf: "RJ",
    },
  });

  assert.equal(incompletePrep.onboardingReady, true);
  assert.equal(incompletePrep.signingReady, false);
  assert.equal(incompletePrep.transmissionReady, false);
  assert.equal(incompletePrep.liveSubmissionReady, false);
  assert.ok(incompletePrep.missingArtifacts.includes("certificate"));
  assert.ok(incompletePrep.nextActions.length > 0);

  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "https://sefaz.example.test/submit") {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.provider, "BR_NFE");
      assert.equal(body.cnpj, "12345678000199");
      return new Response(JSON.stringify({ status: "AUTHORIZED", submissionId: "nfe-123", accessKey: "351234567890" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (String(input).startsWith("https://sefaz.example.test/status")) {
      return new Response(JSON.stringify({ status: "ACCEPTED", accessKey: "351234567890" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch call: ${String(input)}`);
  }) as typeof fetch;

  try {
    const submission = await submitNfeDocument({
      connection: {
        provider: "BR_NFE",
        country: "BR",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          cnpj: "12345678000199",
          certificatePem: "-----BEGIN CERTIFICATE-----",
          privateKeyPem: "-----BEGIN PRIVATE KEY-----",
          certificatePassword: "secret",
          uf: "SP",
          submissionUrl: "https://sefaz.example.test/submit",
          statusUrl: "https://sefaz.example.test/status",
        },
      },
      payload: {
        externalId: "BR-2026-0001",
        format: "UBL_XML",
        payload: { invoiceNumber: "BR-2026-0001" },
        warnings: [],
      },
    });
    assert.equal(submission.status, "ACCEPTED");
    assert.equal(submission.submissionId, "nfe-123");
    assert.equal(submission.providerReference, "351234567890");

    const status = await getNfeSubmissionStatus({
      connection: {
        provider: "BR_NFE",
        country: "BR",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          cnpj: "12345678000199",
          submissionUrl: "https://sefaz.example.test/submit",
          statusUrl: "https://sefaz.example.test/status",
        },
      },
      submissionId: "nfe-123",
    });
    assert.equal(status.status, "ACCEPTED");
    assert.equal(status.providerReference, "351234567890");
  } finally {
    global.fetch = originalFetch;
  }
}

async function main() {
  await runStaticChecks();
  console.log("einvoicing nfe client passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
