import assert from "node:assert/strict";

import {
  buildPlannedGatewayPreparation,
  cancelPlannedGatewayDocument,
  getPlannedGatewayCredentials,
  getPlannedGatewaySubmissionStatus,
  submitPlannedGatewayDocument,
} from "@/lib/einvoicing/providers/planned-gateway-client";

const credentials = getPlannedGatewayCredentials(
  {
    provider: "AE_EINVOICING",
    country: "AE",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      companyTaxId: "AE123456789",
      apiKey: "gateway-secret",
      submissionUrl: "https://gateway.example.test/submit",
      statusUrl: "https://gateway.example.test/status",
      cancelUrl: "https://gateway.example.test/cancel",
    },
  },
  "UAE E-Invoicing"
);

assert.equal(credentials.companyTaxId, "AE123456789");
assert.equal(credentials.apiKey, "gateway-secret");
assert.equal(credentials.submissionUrl, "https://gateway.example.test/submit");

const preparation = buildPlannedGatewayPreparation({
  connection: {
    provider: "AE_EINVOICING",
    country: "AE",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      companyTaxId: "AE123456789",
      apiKey: "gateway-secret",
      submissionUrl: "https://gateway.example.test/submit",
      statusUrl: "https://gateway.example.test/status",
      cancelUrl: "https://gateway.example.test/cancel",
    },
  },
  country: "AE",
  providerLabel: "UAE E-Invoicing",
});

assert.equal(preparation.country, "AE");
assert.equal(preparation.liveSubmissionReady, true);
assert.equal(preparation.liveSubmissionBlockedReason, null);

async function runFetchChecks() {
  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://gateway.example.test/submit") {
      assert.equal(init?.method, "POST");
      return new Response(
        JSON.stringify({ status: "submitted", submissionId: "AE-123", providerReference: "AE-REF-1" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.startsWith("https://gateway.example.test/status")) {
      return new Response(
        JSON.stringify({ status: "accepted", providerReference: "AE-REF-1" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url === "https://gateway.example.test/cancel") {
      assert.equal(init?.method, "POST");
      return new Response(JSON.stringify({ cancelled: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in planned gateway test: ${url}`);
  }) as typeof fetch;

  try {
    const submission = await submitPlannedGatewayDocument({
      connection: {
        provider: "AE_EINVOICING",
        country: "AE",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          companyTaxId: "AE123456789",
          apiKey: "gateway-secret",
          submissionUrl: "https://gateway.example.test/submit",
          statusUrl: "https://gateway.example.test/status",
          cancelUrl: "https://gateway.example.test/cancel",
        },
      },
      providerKey: "AE_EINVOICING",
      providerLabel: "UAE E-Invoicing",
      payload: {
        externalId: "AE-INV-1",
        format: "JSON",
        payload: { invoiceNumber: "AE-INV-1" },
        warnings: [],
      },
    });
    assert.equal(submission.status, "SUBMITTED");
    assert.equal(submission.submissionId, "AE-123");
    assert.equal(submission.providerReference, "AE-REF-1");

    const status = await getPlannedGatewaySubmissionStatus({
      connection: {
        provider: "AE_EINVOICING",
        country: "AE",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          companyTaxId: "AE123456789",
          apiKey: "gateway-secret",
          submissionUrl: "https://gateway.example.test/submit",
          statusUrl: "https://gateway.example.test/status",
        },
      },
      submissionId: "AE-123",
      providerLabel: "UAE E-Invoicing",
    });
    assert.equal(status.status, "ACCEPTED");
    assert.equal(status.providerReference, "AE-REF-1");

    const cancelled = await cancelPlannedGatewayDocument({
      connection: {
        provider: "AE_EINVOICING",
        country: "AE",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          companyTaxId: "AE123456789",
          apiKey: "gateway-secret",
          submissionUrl: "https://gateway.example.test/submit",
          cancelUrl: "https://gateway.example.test/cancel",
        },
      },
      submissionId: "AE-123",
      providerLabel: "UAE E-Invoicing",
    });
    assert.equal(cancelled.status, "CANCELLED");
  } finally {
    global.fetch = originalFetch;
  }
}

runFetchChecks()
  .then(() => {
    console.log("einvoicing planned gateway client passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
