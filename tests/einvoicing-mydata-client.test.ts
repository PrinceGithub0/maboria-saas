import assert from "node:assert/strict";

import {
  buildMyDataBaseUrl,
  buildMyDataCancelInvoiceUrl,
  buildMyDataDeveloperPortalUrl,
  buildMyDataHeaders,
  cancelMyDataInvoice,
  getMyDataInvoiceStatus,
  buildMyDataRequestDocsUrl,
  buildMyDataRequestMyExpensesUrl,
  buildMyDataRequestMyIncomeUrl,
  buildMyDataRequestTransmittedDocsUrl,
  buildMyDataSendExpensesClassificationUrl,
  buildMyDataSendIncomeClassificationUrl,
  buildMyDataSendInvoicesUrl,
  buildMyDataSendPaymentsMethodUrl,
  buildMyDataTestRegistrationUrl,
  buildMyDataUserRegistrationUrl,
  getMyDataCredentials,
} from "@/lib/einvoicing/providers/mydata-client";

function runStaticChecks() {
  const credentials = getMyDataCredentials({
    provider: "MYDATA",
    country: "GR",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      aadeUserId: "maboria-user",
      subscriptionKey: "subscription-key-123",
      entityVatNumber: "EL123456789",
    },
  });

  assert.equal(credentials.aadeUserId, "maboria-user");
  assert.equal(credentials.subscriptionKey, "subscription-key-123");
  assert.equal(credentials.entityVatNumber, "EL123456789");

  assert.throws(
    () =>
      getMyDataCredentials({
        provider: "MYDATA",
        country: "GR",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          aadeUserId: "maboria-user",
        },
      }),
    /AADE user ID and subscription key/
  );

  assert.equal(buildMyDataBaseUrl({ connection: { provider: "MYDATA", country: "GR", sandbox: true, status: "ACTIVE", hasCredentials: true } }), "https://mydataapidev.aade.gr");
  assert.equal(buildMyDataBaseUrl({ connection: { provider: "MYDATA", country: "GR", sandbox: false, status: "ACTIVE", hasCredentials: true } }), "https://mydatapi.aade.gr/myDATA");
  assert.equal(buildMyDataBaseUrl({ baseUrl: "https://custom.example/api/", connection: { provider: "MYDATA", country: "GR", sandbox: true, status: "ACTIVE", hasCredentials: true } }), "https://custom.example/api");

  const headers = buildMyDataHeaders({
    provider: "MYDATA",
    country: "GR",
    sandbox: true,
    status: "ACTIVE",
    hasCredentials: true,
    credentials: {
      aadeUserId: "maboria-user",
      subscriptionKey: "subscription-key-123",
    },
  });
  assert.deepEqual(headers, {
    "aade-user-id": "maboria-user",
    "ocp-apim-subscription-key": "subscription-key-123",
  });

  assert.equal(buildMyDataDeveloperPortalUrl(), "https://mydata-dev.portal.azure-api.net");
  assert.equal(buildMyDataTestRegistrationUrl(), "https://mydata-dev-register.azurewebsites.net");
  assert.equal(buildMyDataUserRegistrationUrl(), "https://www1.aade.gr/saadeapps2/bookkeeper-web");

  assert.equal(
    buildMyDataSendInvoicesUrl({ connection: { provider: "MYDATA", country: "GR", sandbox: true, status: "ACTIVE", hasCredentials: true } }),
    "https://mydataapidev.aade.gr/SendInvoices"
  );
  assert.equal(
    buildMyDataSendIncomeClassificationUrl({ connection: { provider: "MYDATA", country: "GR", sandbox: false, status: "ACTIVE", hasCredentials: true } }),
    "https://mydatapi.aade.gr/myDATA/SendIncomeClassification"
  );
  assert.equal(
    buildMyDataSendExpensesClassificationUrl({ connection: { provider: "MYDATA", country: "GR", sandbox: false, status: "ACTIVE", hasCredentials: true } }),
    "https://mydatapi.aade.gr/myDATA/SendExpensesClassification"
  );
  assert.equal(
    buildMyDataSendPaymentsMethodUrl({ connection: { provider: "MYDATA", country: "GR", sandbox: false, status: "ACTIVE", hasCredentials: true } }),
    "https://mydatapi.aade.gr/myDATA/SendPaymentsMethod"
  );
  assert.equal(
    buildMyDataRequestDocsUrl({
      connection: { provider: "MYDATA", country: "GR", sandbox: true, status: "ACTIVE", hasCredentials: true },
      params: { mark: "12345", entityVatNumber: "EL123456789", invType: 1 },
    }),
    "https://mydataapidev.aade.gr/RequestDocs?mark=12345&entityVatNumber=EL123456789&invType=1"
  );
  assert.equal(
    buildMyDataRequestTransmittedDocsUrl({
      connection: { provider: "MYDATA", country: "GR", sandbox: false, status: "ACTIVE", hasCredentials: true },
      params: { mark: "12345", dateFrom: "2026-04-01", dateTo: "2026-04-04", maxMark: 999 },
    }),
    "https://mydatapi.aade.gr/myDATA/RequestTransmittedDocs?mark=12345&dateFrom=2026-04-01&dateTo=2026-04-04&maxMark=999"
  );
  assert.equal(
    buildMyDataCancelInvoiceUrl({
      connection: { provider: "MYDATA", country: "GR", sandbox: true, status: "ACTIVE", hasCredentials: true },
      params: { mark: "98765", entityVatNumber: "EL123456789" },
    }),
    "https://mydataapidev.aade.gr/CancelInvoice?mark=98765&entityVatNumber=EL123456789"
  );
  assert.equal(
    buildMyDataRequestMyIncomeUrl({
      connection: { provider: "MYDATA", country: "GR", sandbox: false, status: "ACTIVE", hasCredentials: true },
      params: { entityVatNumber: "EL123456789" },
    }),
    "https://mydatapi.aade.gr/myDATA/RequestMyIncome?entityVatNumber=EL123456789"
  );
  assert.equal(
    buildMyDataRequestMyExpensesUrl({
      connection: { provider: "MYDATA", country: "GR", sandbox: false, status: "ACTIVE", hasCredentials: true },
      params: { entityVatNumber: "EL123456789" },
    }),
    "https://mydatapi.aade.gr/myDATA/RequestMyExpenses?entityVatNumber=EL123456789"
  );
}

async function main() {
  runStaticChecks();
  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/RequestTransmittedDocs")) {
      assert.equal(init?.method, "GET");
      return new Response(JSON.stringify([{ status: "accepted", uid: "UID-123", mark: "MARK-123" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/CancelInvoice")) {
      assert.equal(init?.method, "POST");
      return new Response(JSON.stringify({ cancelled: true, mark: "MARK-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  }) as typeof fetch;

  try {
    const status = await getMyDataInvoiceStatus({
      connection: {
        provider: "MYDATA",
        country: "GR",
        sandbox: true,
        status: "ACTIVE",
        hasCredentials: true,
        credentials: {
          aadeUserId: "maboria-user",
          subscriptionKey: "subscription-key-123",
          entityVatNumber: "EL123456789",
        },
      },
      submissionId: "MARK-123",
    });
    assert.equal(status.status, "ACCEPTED");
    assert.equal(status.providerReference, "UID-123");

    const cancelled = await cancelMyDataInvoice({
      connection: {
        provider: "MYDATA",
        country: "GR",
        sandbox: true,
        status: "ACTIVE",
        hasCredentials: true,
        credentials: {
          aadeUserId: "maboria-user",
          subscriptionKey: "subscription-key-123",
          entityVatNumber: "EL123456789",
        },
      },
      submissionId: "MARK-123",
    });
    assert.equal(cancelled.status, "CANCELLED");
  } finally {
    global.fetch = originalFetch;
  }
  console.log("einvoicing mydata client passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
