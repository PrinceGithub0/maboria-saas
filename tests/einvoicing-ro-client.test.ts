import assert from "node:assert/strict";

import {
  buildRoEFacturaAuthorizeUrl,
  cancelRoEFacturaDocument,
  buildRoEFacturaDownloadUrl,
  buildRoEFacturaListMessagesUrl,
  buildRoEFacturaStatusUrl,
  buildRoEFacturaUploadUrl,
  exchangeRoEFacturaAuthorizationCode,
  getRoEFacturaSubmissionStatus,
  getRoEFacturaCredentials,
  refreshRoEFacturaAccessToken,
  submitRoEFacturaDocument,
} from "@/lib/einvoicing/providers/ro-efactura-client";

function runStaticChecks() {
  const credentials = getRoEFacturaCredentials({
    provider: "RO_EFACTURA",
    country: "RO",
    status: "ACTIVE",
    sandbox: true,
    hasCredentials: true,
    credentials: {
      clientId: "anaf-client",
      clientSecret: "anaf-secret",
      redirectUri: "https://app.maboria.test/api/einvoicing/ro/callback",
      refreshToken: "refresh-token-value",
      cif: "RO12345678",
    },
  });

  assert.equal(credentials.clientId, "anaf-client");
  assert.equal(credentials.clientSecret, "anaf-secret");
  assert.equal(credentials.redirectUri, "https://app.maboria.test/api/einvoicing/ro/callback");
  assert.equal(credentials.refreshToken, "refresh-token-value");
  assert.equal(credentials.cif, "RO12345678");

  assert.throws(
    () =>
      getRoEFacturaCredentials({
        provider: "RO_EFACTURA",
        country: "RO",
        status: "ACTIVE",
        sandbox: true,
        hasCredentials: true,
        credentials: {
          clientId: "anaf-client",
        },
      }),
    /client ID, client secret, and redirect URI/
  );

  const authorizeUrl = new URL(
    buildRoEFacturaAuthorizeUrl({
      clientId: "anaf-client",
      redirectUri: "https://app.maboria.test/api/einvoicing/ro/callback",
      state: "xyz123",
    })
  );
  assert.equal(authorizeUrl.origin, "https://logincert.anaf.ro");
  assert.equal(authorizeUrl.pathname, "/anaf-oauth2/v1/authorize");
  assert.equal(authorizeUrl.searchParams.get("client_id"), "anaf-client");
  assert.equal(authorizeUrl.searchParams.get("redirect_uri"), "https://app.maboria.test/api/einvoicing/ro/callback");
  assert.equal(authorizeUrl.searchParams.get("response_type"), "code");
  assert.equal(authorizeUrl.searchParams.get("token_content_type"), "jwt");
  assert.equal(authorizeUrl.searchParams.get("state"), "xyz123");

  assert.equal(
    buildRoEFacturaUploadUrl({
      connection: { provider: "RO_EFACTURA", country: "RO", sandbox: true, status: "ACTIVE", hasCredentials: true },
      standard: "UBL",
      cif: "RO12345678",
    }),
    "https://webserviceapl.anaf.ro/test/FCTEL/rest/upload?standard=UBL&cif=RO12345678"
  );

  assert.equal(
    buildRoEFacturaStatusUrl({
      connection: { provider: "RO_EFACTURA", country: "RO", sandbox: false, status: "ACTIVE", hasCredentials: true },
      uploadIndex: "98765",
    }),
    "https://webserviceapl.anaf.ro/prod/FCTEL/rest/stareMesaj?id_incarcare=98765"
  );

  assert.equal(
    buildRoEFacturaListMessagesUrl({
      connection: { provider: "RO_EFACTURA", country: "RO", sandbox: true, status: "ACTIVE", hasCredentials: true },
      days: 30,
      cif: "RO12345678",
    }),
    "https://webserviceapl.anaf.ro/test/FCTEL/rest/listaMesajeFactura?zile=30&cif=RO12345678"
  );

  assert.equal(
    buildRoEFacturaDownloadUrl({
      connection: { provider: "RO_EFACTURA", country: "RO", sandbox: false, status: "ACTIVE", hasCredentials: true },
      id: "555",
    }),
    "https://webserviceapl.anaf.ro/prod/FCTEL/rest/descarcare?id=555"
  );
}

async function runFetchChecks() {
  const originalFetch = global.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const readHeader = (headers: HeadersInit | undefined, key: string) => {
    if (!headers) return null;
    if (headers instanceof Headers) {
      return headers.get(key);
    }
    if (Array.isArray(headers)) {
      const found = headers.find(([headerKey]) => headerKey.toLowerCase() === key.toLowerCase());
      return found?.[1] ?? null;
    }
    return headers[key] ?? headers[key.toLowerCase()] ?? null;
  };

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url === "https://logincert.anaf.ro/anaf-oauth2/v1/token") {
      const body = String(init?.body || "");
      if (body.includes("grant_type=authorization_code")) {
        return new Response(
          JSON.stringify({
            access_token: "anaf-access-token",
            refresh_token: "anaf-refresh-token",
            expires_in: 7776000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (body.includes("grant_type=refresh_token")) {
        return new Response(
          JSON.stringify({
            access_token: "anaf-access-token-2",
            refresh_token: "anaf-refresh-token-2",
            expires_in: 7776000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (url.startsWith("https://webserviceapl.anaf.ro/test/FCTEL/rest/upload")) {
      assert.equal(init?.method, "POST");
      assert.equal(readHeader(init?.headers, "Authorization"), "Bearer anaf-access-token-2");
      assert.equal(readHeader(init?.headers, "Content-Type"), "application/xml; charset=utf-8");
      assert.match(String(init?.body || ""), /<Invoice>/);
      return new Response("id_incarcare=998877&stare=ok", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (url.startsWith("https://webserviceapl.anaf.ro/test/FCTEL/rest/stareMesaj")) {
      assert.equal(init?.method, "GET");
      assert.equal(readHeader(init?.headers, "Authorization"), "Bearer anaf-access-token-2");
      return new Response("id_incarcare=998877&id_descarcare=554433&stare=ok", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (url === "https://cancel.maboria.test/ro") {
      assert.equal(init?.method, "POST");
      assert.equal(readHeader(init?.headers, "Authorization"), "Bearer anaf-access-token-2");
      return new Response(JSON.stringify({ ok: true, status: "cancelled" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch call in RO e-Factura test: ${url}`);
  }) as typeof fetch;

  try {
    const tokenResponse = await exchangeRoEFacturaAuthorizationCode({
      clientId: "anaf-client",
      clientSecret: "anaf-secret",
      redirectUri: "https://app.maboria.test/api/einvoicing/ro/callback",
      code: "oauth-code-123",
    });

    assert.equal(tokenResponse.accessToken, "anaf-access-token");
    assert.equal(tokenResponse.refreshToken, "anaf-refresh-token");
    assert.equal(tokenResponse.expiresIn, 7776000);

    const codeExchangeCall = calls[0];
    assert.equal(codeExchangeCall?.url, "https://logincert.anaf.ro/anaf-oauth2/v1/token");
    assert.equal(codeExchangeCall?.init?.method, "POST");
    assert.equal(readHeader(codeExchangeCall?.init?.headers, "Content-Type"), "application/x-www-form-urlencoded");
    assert.equal(readHeader(codeExchangeCall?.init?.headers, "Accept"), "application/json");
    assert.equal(
      readHeader(codeExchangeCall?.init?.headers, "Authorization"),
      `Basic ${Buffer.from("anaf-client:anaf-secret", "utf8").toString("base64")}`
    );
    assert.match(String(codeExchangeCall?.init?.body || ""), /grant_type=authorization_code/);
    assert.match(String(codeExchangeCall?.init?.body || ""), /code=oauth-code-123/);

    const refreshResponse = await refreshRoEFacturaAccessToken({
      clientId: "anaf-client",
      clientSecret: "anaf-secret",
      refreshToken: "anaf-refresh-token",
    });

    assert.equal(refreshResponse.accessToken, "anaf-access-token-2");
    assert.equal(refreshResponse.refreshToken, "anaf-refresh-token-2");
    assert.equal(refreshResponse.expiresIn, 7776000);

    const refreshCall = calls[1];
    assert.equal(refreshCall?.url, "https://logincert.anaf.ro/anaf-oauth2/v1/token");
    assert.equal(refreshCall?.init?.method, "POST");
    assert.match(String(refreshCall?.init?.body || ""), /grant_type=refresh_token/);
    assert.match(String(refreshCall?.init?.body || ""), /refresh_token=anaf-refresh-token/);

    const submission = await submitRoEFacturaDocument({
      connection: {
        provider: "RO_EFACTURA",
        country: "RO",
        sandbox: true,
        status: "ACTIVE",
        hasCredentials: true,
        credentials: {
          clientId: "anaf-client",
          clientSecret: "anaf-secret",
          redirectUri: "https://app.maboria.test/api/einvoicing/ro/callback",
          refreshToken: "anaf-refresh-token",
          cif: "RO12345678",
        },
      },
      xml: "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Invoice><ID>INV-RO-001</ID></Invoice>",
      standard: "UBL",
    });

    assert.equal(submission.status, "SUBMITTED");
    assert.equal(submission.submissionId, "998877");
    assert.equal(submission.providerReference, "998877");

    const status = await getRoEFacturaSubmissionStatus({
      connection: {
        provider: "RO_EFACTURA",
        country: "RO",
        sandbox: true,
        status: "ACTIVE",
        hasCredentials: true,
        credentials: {
          clientId: "anaf-client",
          clientSecret: "anaf-secret",
          redirectUri: "https://app.maboria.test/api/einvoicing/ro/callback",
          refreshToken: "anaf-refresh-token",
          cif: "RO12345678",
        },
      },
      submissionId: "998877",
    });

    assert.equal(status.status, "ACCEPTED");
    assert.equal(status.providerReference, "554433");

    const cancellation = await cancelRoEFacturaDocument({
      connection: {
        provider: "RO_EFACTURA",
        country: "RO",
        sandbox: true,
        status: "ACTIVE",
        hasCredentials: true,
        credentials: {
          clientId: "anaf-client",
          clientSecret: "anaf-secret",
          redirectUri: "https://app.maboria.test/api/einvoicing/ro/callback",
          refreshToken: "anaf-refresh-token",
          cif: "RO12345678",
          cancelUrl: "https://cancel.maboria.test/ro",
        },
      },
      submissionId: "998877",
    });

    assert.equal(cancellation.status, "CANCELLED");
  } finally {
    global.fetch = originalFetch;
  }
}

async function main() {
  runStaticChecks();
  await runFetchChecks();
  console.log("einvoicing ro client passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
