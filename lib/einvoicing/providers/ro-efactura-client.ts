import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "@/lib/einvoicing/types";

const ANAF_AUTHORIZE_URL = "https://logincert.anaf.ro/anaf-oauth2/v1/authorize";
const ANAF_TOKEN_URL = "https://logincert.anaf.ro/anaf-oauth2/v1/token";
const RO_EFACTURA_TEST_BASE_URL = "https://webserviceapl.anaf.ro/test/FCTEL/rest";
const RO_EFACTURA_PRODUCTION_BASE_URL = "https://webserviceapl.anaf.ro/prod/FCTEL/rest";

type RoEFacturaCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
  cif?: string;
  cancelUrl?: string;
};

type RoEFacturaTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  rawResponse: Record<string, unknown> | null;
};

const trim = (value: unknown) => String(value || "").trim();

function parseJsonSafe(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function getBaseUrl(connection?: EInvoiceConnectionConfig | null) {
  return connection?.sandbox === false ? RO_EFACTURA_PRODUCTION_BASE_URL : RO_EFACTURA_TEST_BASE_URL;
}

function parseKeyValueResponse(text: string) {
  const params = new URLSearchParams(String(text || "").trim());
  if (!Array.from(params.keys()).length) return null;
  return Object.fromEntries(params.entries()) as Record<string, string>;
}

async function parseRoResponse(response: Response) {
  const text = await response.text();
  const jsonPayload = parseJsonSafe(text);
  const keyValuePayload = parseKeyValueResponse(text);
  return {
    text,
    payload:
      (jsonPayload && !("raw" in jsonPayload) ? jsonPayload : null) ||
      keyValuePayload ||
      jsonPayload ||
      null,
  };
}

function getResponseField(payload: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = trim(payload?.[key]);
    if (value) return value;
  }
  return "";
}

async function getRoEFacturaAccessToken(connection?: EInvoiceConnectionConfig | null) {
  const credentials = getRoEFacturaCredentials(connection);
  if (!credentials.refreshToken) {
    throw new Error("RO e-Factura requires a refresh token before live submission.");
  }
  return refreshRoEFacturaAccessToken({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken: credentials.refreshToken,
  });
}

export function getRoEFacturaCredentials(connection?: EInvoiceConnectionConfig | null): RoEFacturaCredentials {
  const credentials = (connection?.credentials || {}) as Record<string, unknown>;
  const clientId = trim(credentials.clientId);
  const clientSecret = trim(credentials.clientSecret);
  const redirectUri = trim(credentials.redirectUri);
  const refreshToken = trim(credentials.refreshToken);
  const cif = trim(credentials.cif);
  const cancelUrl = trim(credentials.cancelUrl);

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("RO e-Factura requires client ID, client secret, and redirect URI.");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    ...(refreshToken ? { refreshToken } : {}),
    ...(cif ? { cif } : {}),
    ...(cancelUrl ? { cancelUrl } : {}),
  };
}

export function buildRoEFacturaAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state?: string;
}) {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    token_content_type: "jwt",
  });
  if (input.state) params.set("state", input.state);
  return `${ANAF_AUTHORIZE_URL}?${params.toString()}`;
}

function buildBasicAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

export async function exchangeRoEFacturaAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    token_content_type: "jwt",
  });
  const response = await fetch(ANAF_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: buildBasicAuthHeader(input.clientId, input.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const text = await response.text();
  const payload = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(payload?.error_description || payload?.error || payload?.message) || "RO e-Factura OAuth code exchange failed.");
  }
  return {
    accessToken: trim(payload?.access_token),
    refreshToken: trim(payload?.refresh_token) || null,
    expiresIn: Number(payload?.expires_in || 0) || null,
    rawResponse: payload,
  } satisfies RoEFacturaTokenResponse;
}

export async function refreshRoEFacturaAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    token_content_type: "jwt",
  });
  const response = await fetch(ANAF_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: buildBasicAuthHeader(input.clientId, input.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const text = await response.text();
  const payload = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(payload?.error_description || payload?.error || payload?.message) || "RO e-Factura refresh token exchange failed.");
  }
  return {
    accessToken: trim(payload?.access_token),
    refreshToken: trim(payload?.refresh_token) || trim(input.refreshToken) || null,
    expiresIn: Number(payload?.expires_in || 0) || null,
    rawResponse: payload,
  } satisfies RoEFacturaTokenResponse;
}

export function buildRoEFacturaUploadUrl(input: {
  connection?: EInvoiceConnectionConfig | null;
  standard?: "UBL" | "CII" | "RASP";
  cif?: string | null;
}) {
  const params = new URLSearchParams({
    standard: input.standard || "UBL",
  });
  const resolvedCif = trim(input.cif);
  if (resolvedCif) params.set("cif", resolvedCif);
  return `${getBaseUrl(input.connection)}/upload?${params.toString()}`;
}

export function buildRoEFacturaStatusUrl(input: {
  connection?: EInvoiceConnectionConfig | null;
  uploadIndex: string;
}) {
  const params = new URLSearchParams({ id_incarcare: input.uploadIndex });
  return `${getBaseUrl(input.connection)}/stareMesaj?${params.toString()}`;
}

export function buildRoEFacturaListMessagesUrl(input: {
  connection?: EInvoiceConnectionConfig | null;
  days: number;
  cif: string;
}) {
  const params = new URLSearchParams({
    zile: String(input.days),
    cif: input.cif,
  });
  return `${getBaseUrl(input.connection)}/listaMesajeFactura?${params.toString()}`;
}

export function buildRoEFacturaDownloadUrl(input: {
  connection?: EInvoiceConnectionConfig | null;
  id: string;
}) {
  const params = new URLSearchParams({ id: input.id });
  return `${getBaseUrl(input.connection)}/descarcare?${params.toString()}`;
}

export async function submitRoEFacturaDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  xml: string;
  standard?: "UBL" | "CII" | "RASP";
  cif?: string | null;
}): Promise<EInvoiceSubmissionResult> {
  const token = await getRoEFacturaAccessToken(input.connection);
  const credentials = getRoEFacturaCredentials(input.connection);
  const response = await fetch(
    buildRoEFacturaUploadUrl({
      connection: input.connection,
      standard: input.standard || "UBL",
      cif: input.cif || credentials.cif || null,
    }),
    {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: input.xml,
    }
  );

  const { payload } = await parseRoResponse(response);
  if (!response.ok) {
    throw new Error(
      getResponseField(payload, "error_description", "error", "Errors", "message", "titlu") ||
        `RO e-Factura upload failed with status ${response.status}.`
    );
  }

  const uploadIndex =
    getResponseField(payload, "id_incarcare", "uploadIndex", "index_incarcare", "id") || "";
  if (!uploadIndex) {
    throw new Error("RO e-Factura upload response did not include an upload index.");
  }

  return {
    status: "SUBMITTED",
    submissionId: uploadIndex,
    providerReference: uploadIndex,
    rawResponse: payload,
  };
}

export async function getRoEFacturaSubmissionStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceStatusResult> {
  const token = await getRoEFacturaAccessToken(input.connection);
  const response = await fetch(
    buildRoEFacturaStatusUrl({
      connection: input.connection,
      uploadIndex: input.submissionId,
    }),
    {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        Authorization: `Bearer ${token.accessToken}`,
      },
    }
  );

  const { payload } = await parseRoResponse(response);
  if (!response.ok) {
    throw new Error(
      getResponseField(payload, "error_description", "error", "Errors", "message", "titlu") ||
        `RO e-Factura status lookup failed with status ${response.status}.`
    );
  }

  const normalizedStatus = getResponseField(payload, "stare", "status", "message", "executionStatus").toLowerCase();
  const providerReference =
    getResponseField(payload, "id_descarcare", "downloadId", "id", "id_incarcare") || input.submissionId;

  if (normalizedStatus.includes("nok") || normalizedStatus.includes("error") || normalizedStatus.includes("eroare")) {
    return {
      status: "REJECTED",
      providerReference,
      rawResponse: payload,
      errorMessage: getResponseField(payload, "Errors", "message", "detalii") || "RO e-Factura submission was rejected.",
    };
  }
  if (
    normalizedStatus.includes("ok") ||
    normalizedStatus.includes("valid") ||
    normalizedStatus.includes("transmis") ||
    normalizedStatus.includes("procesat")
  ) {
    return {
      status: "ACCEPTED",
      providerReference,
      rawResponse: payload,
    };
  }

  return {
    status: "SUBMITTED",
    providerReference,
    rawResponse: payload,
  };
}

export async function cancelRoEFacturaDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceCancellationResult> {
  const token = await getRoEFacturaAccessToken(input.connection);
  const credentials = getRoEFacturaCredentials(input.connection);
  if (!credentials.cancelUrl) {
    throw new Error("RO e-Factura cancellation requires a cancellation URL.");
  }

  const response = await fetch(credentials.cancelUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "RO_EFACTURA",
      cif: credentials.cif || null,
      submissionId: input.submissionId,
    }),
  });

  const { payload } = await parseRoResponse(response);
  if (!response.ok) {
    throw new Error(
      getResponseField(payload, "error_description", "error", "Errors", "message", "titlu") ||
        `RO e-Factura cancellation failed with status ${response.status}.`
    );
  }

  return {
    status: "CANCELLED",
    rawResponse: payload,
  };
}
