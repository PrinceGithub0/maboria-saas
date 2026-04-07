import assert from "node:assert/strict";

import {
  cancelCfdiDocument,
  buildCfdiGuidesUrl,
  buildCfdiPacRegistryUrl,
  buildCfdiPortalUrl,
  buildCfdiSandboxMetadata,
  buildCfdiTransmissionPreparation,
  getCfdiSubmissionStatus,
  getCfdiCredentials,
  submitCfdiDocument,
} from "@/lib/einvoicing/providers/cfdi-client";

const credentials = getCfdiCredentials({
  provider: "RO_EFACTURA",
  country: "MX",
  status: "ACTIVE",
  sandbox: true,
  hasCredentials: true,
  credentials: {
    rfc: "AAA010101AAA",
    ciec: "ciec-secret",
    csdCertificatePem: "CERT",
    csdPrivateKeyPem: "KEY",
    pacUrl: "https://pac.example.test/submit",
    pacStatusUrl: "https://pac.example.test/status",
  },
});

assert.equal(credentials.rfc, "AAA010101AAA");
assert.equal(credentials.ciec, "ciec-secret");
assert.equal(credentials.pacUrl, "https://pac.example.test/submit");
assert.equal(credentials.pacStatusUrl, "https://pac.example.test/status");
assert.equal(buildCfdiPortalUrl(), "https://www.sat.gob.mx/aplicacion/53027/factura-electronica");
assert.equal(buildCfdiPacRegistryUrl(), "https://www.sat.gob.mx/personas/factura-electronica");
assert.equal(buildCfdiGuidesUrl(), "https://www.sat.gob.mx/consultas/57964/consulta-de-documentacion-tecnica");

const prep = buildCfdiSandboxMetadata({
  provider: "RO_EFACTURA",
  country: "MX",
  status: "ACTIVE",
  sandbox: true,
  hasCredentials: true,
  credentials: { rfc: "AAA010101AAA" },
});

assert.equal(prep.country, "MX");
assert.equal(prep.presentArtifacts.includes("AAA010101AAA"), true);

const transmission = buildCfdiTransmissionPreparation({
  provider: "MX_CFDI",
  country: "MX",
  status: "ACTIVE",
  sandbox: true,
  hasCredentials: true,
  credentials: {
    rfc: "AAA010101AAA",
    ciec: "ciec-secret",
    csdCertificatePem: "CERT",
    csdPrivateKeyPem: "KEY",
    csdPrivateKeyPassword: "pass",
    pacUrl: "https://pac.example.test/submit",
    pacStatusUrl: "https://pac.example.test/status",
  },
});

assert.equal(transmission.liveSubmissionReady, true);
assert.equal(transmission.liveSubmissionBlockedReason, null);
assert.ok(transmission.notes.some((note) => note.includes("PAC")));

async function runFetchChecks() {
  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://pac.example.test/submit") {
      assert.equal(init?.method, "POST");
      return new Response(
        JSON.stringify({ status: "accepted", submissionId: "CFDI-123", uuid: "UUID-123" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.startsWith("https://pac.example.test/status")) {
      return new Response(
        JSON.stringify({ status: "accepted", providerReference: "UUID-123" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url === "https://pac.example.test/cancel") {
      assert.equal(init?.method, "POST");
      return new Response(JSON.stringify({ cancelled: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in CFDI test: ${url}`);
  }) as typeof fetch;

  try {
    const submission = await submitCfdiDocument({
      connection: {
        provider: "MX_CFDI",
        country: "MX",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          rfc: "AAA010101AAA",
          csdCertificatePem: "CERT",
          csdPrivateKeyPem: "KEY",
          csdPrivateKeyPassword: "pass",
          pacUrl: "https://pac.example.test/submit",
          pacStatusUrl: "https://pac.example.test/status",
        },
      },
      payload: {
        externalId: "MX-INV-1",
        format: "UBL_XML",
        payload: { serie: "MX", folio: "1" },
        warnings: [],
      },
    });

    assert.equal(submission.status, "ACCEPTED");
    assert.equal(submission.submissionId, "CFDI-123");
    assert.equal(submission.providerReference, "UUID-123");

    const status = await getCfdiSubmissionStatus({
      connection: {
        provider: "MX_CFDI",
        country: "MX",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          rfc: "AAA010101AAA",
          pacUrl: "https://pac.example.test/submit",
          pacStatusUrl: "https://pac.example.test/status",
        },
      },
      submissionId: "CFDI-123",
    });

    assert.equal(status.status, "ACCEPTED");
    assert.equal(status.providerReference, "UUID-123");

    const cancelled = await cancelCfdiDocument({
      connection: {
        provider: "MX_CFDI",
        country: "MX",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          rfc: "AAA010101AAA",
          pacUrl: "https://pac.example.test/submit",
          pacStatusUrl: "https://pac.example.test/status",
          pacCancelUrl: "https://pac.example.test/cancel",
        },
      },
      submissionId: "CFDI-123",
    });

    assert.equal(cancelled.status, "CANCELLED");
  } finally {
    global.fetch = originalFetch;
  }
}

runFetchChecks().then(() => {
  console.log("einvoicing cfdi client passed");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
