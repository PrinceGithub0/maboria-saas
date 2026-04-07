import crypto from "crypto";

import { log } from "@/lib/logger";
import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoicePayloadBuildResult,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "@/lib/einvoicing/types";

const SANDBOX_BASE_URL = "https://preprod-api.myinvois.hasil.gov.my";
const PRODUCTION_BASE_URL = "https://api.myinvois.hasil.gov.my";
const DEFAULT_SCOPE = "InvoicingAPI";

type MyInvoisCredentials = {
  clientId: string;
  clientSecret: string;
  scope?: string;
  onBehalfOf?: string;
  cancelUrl?: string;
};

type TokenCacheEntry = {
  accessToken: string;
  expiresAt: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();

const trim = (value: unknown) => String(value || "").trim();

function getBaseUrl(connection?: EInvoiceConnectionConfig | null) {
  return connection?.sandbox === false ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
}

function getCredentials(connection?: EInvoiceConnectionConfig | null): MyInvoisCredentials {
  const credentials = (connection?.credentials || {}) as Record<string, unknown>;
  const clientId = trim(credentials.clientId);
  const clientSecret = trim(credentials.clientSecret);
  const scope = trim(credentials.scope) || DEFAULT_SCOPE;
  const onBehalfOf = trim(credentials.onBehalfOf) || "";
  const cancelUrl = trim(credentials.cancelUrl) || "";

  if (!clientId || !clientSecret) {
    throw new Error("MyInvois client ID and client secret are required before live submission.");
  }

  return {
    clientId,
    clientSecret,
    scope,
    ...(onBehalfOf ? { onBehalfOf } : {}),
    ...(cancelUrl ? { cancelUrl } : {}),
  };
}

function getConnectionCacheKey(connection?: EInvoiceConnectionConfig | null) {
  return trim(connection?.id) || `${trim(connection?.provider)}:${trim(connection?.country)}:${connection?.sandbox === false ? "live" : "sandbox"}`;
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function pickErrorMessage(payload: Record<string, unknown> | null) {
  if (!payload) return "";
  const nestedError =
    payload.error && typeof payload.error === "object" && !Array.isArray(payload.error)
      ? (payload.error as Record<string, unknown>)
      : null;
  return String(
    nestedError?.message ||
      payload.error_description ||
      payload.error ||
      payload.message ||
      payload.title ||
      ""
  ).trim();
}

async function getAccessToken(connection?: EInvoiceConnectionConfig | null) {
  const credentials = getCredentials(connection);
  const cacheKey = getConnectionCacheKey(connection);
  const now = Date.now();
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    scope: credentials.scope || DEFAULT_SCOPE,
  });
  const tokenUrl = `${getBaseUrl(connection)}/connect/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    const message = pickErrorMessage(payload) || `MyInvois token request failed with status ${response.status}.`;
    throw new Error(message);
  }

  const accessToken = trim(payload?.access_token);
  const expiresIn = Number(payload?.expires_in || 0);
  if (!accessToken) {
    throw new Error("MyInvois token response did not include an access token.");
  }

  tokenCache.set(cacheKey, {
    accessToken,
    expiresAt: now + Math.max(0, expiresIn - 60) * 1000,
  });
  return accessToken;
}

function buildAuthHeaders(connection?: EInvoiceConnectionConfig | null, accessToken?: string) {
  const credentials = getCredentials(connection);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": "en",
    Authorization: `Bearer ${accessToken || ""}`,
    "Content-Type": "application/json",
  };
  if (credentials.onBehalfOf) {
    headers.onbehalfof = credentials.onBehalfOf;
  }
  return headers;
}

function buildSubmissionEnvelope(payload: EInvoicePayloadBuildResult) {
  const documentJson = JSON.stringify(payload.payload);
  const documentHash = crypto.createHash("sha256").update(documentJson).digest("hex");
  return {
    documents: [
      {
        format: "JSON",
        document: Buffer.from(documentJson, "utf8").toString("base64"),
        documentHash,
        codeNumber: payload.externalId,
      },
    ],
  };
}

export async function submitMyInvoisDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  payload: EInvoicePayloadBuildResult;
}): Promise<EInvoiceSubmissionResult> {
  const accessToken = await getAccessToken(input.connection);
  const response = await fetch(`${getBaseUrl(input.connection)}/api/v1.0/documentsubmissions/`, {
    method: "POST",
    headers: buildAuthHeaders(input.connection, accessToken),
    body: JSON.stringify(buildSubmissionEnvelope(input.payload)),
  });
  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const message = pickErrorMessage(payload) || `MyInvois submission failed with status ${response.status}.`;
    throw new Error(message);
  }

  const submissionId =
    trim(payload?.submissionUID) ||
    trim(payload?.submissionUid) ||
    trim(payload?.submissionId);
  if (!submissionId) {
    throw new Error("MyInvois submission response did not include a submission ID.");
  }

  const acceptedDocuments = Array.isArray(payload?.acceptedDocuments)
    ? (payload?.acceptedDocuments as Record<string, unknown>[])
    : [];
  const rejectedDocuments = Array.isArray(payload?.rejectedDocuments)
    ? (payload?.rejectedDocuments as Record<string, unknown>[])
    : [];
  const acceptedDocument = acceptedDocuments[0] || null;
  const rejectedDocument = rejectedDocuments[0] || null;
  const providerReference =
    trim(acceptedDocument?.uuid) ||
    trim(acceptedDocument?.longId) ||
    trim(rejectedDocument?.uuid) ||
    null;

  return {
    status: acceptedDocument ? "SUBMITTED" : "QUEUED",
    submissionId,
    providerReference,
    rawResponse: payload,
  };
}

export async function getMyInvoisSubmissionStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceStatusResult> {
  const accessToken = await getAccessToken(input.connection);
  const response = await fetch(
    `${getBaseUrl(input.connection)}/api/v1.0/documentsubmissions/${encodeURIComponent(input.submissionId)}`,
    {
      method: "GET",
      headers: buildAuthHeaders(input.connection, accessToken),
    }
  );
  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const message = pickErrorMessage(payload) || `MyInvois status lookup failed with status ${response.status}.`;
    throw new Error(message);
  }

  const overallStatus = trim(payload?.overallStatus).toLowerCase();
  const documentSummary = Array.isArray(payload?.documentSummary)
    ? ((payload?.documentSummary as Record<string, unknown>[])[0] || null)
    : null;
  const providerReference =
    trim(documentSummary?.uuid) ||
    trim(documentSummary?.longId) ||
    trim(payload?.submissionUid) ||
    null;

  if (overallStatus === "valid") {
    return { status: "ACCEPTED", providerReference, rawResponse: payload };
  }
  if (overallStatus === "invalid" || overallStatus === "partially valid") {
    return {
      status: "REJECTED",
      providerReference,
      rawResponse: payload,
      errorMessage: trim(documentSummary?.status) || "MyInvois submission was rejected.",
    };
  }
  return {
    status: "SUBMITTED",
    providerReference,
    rawResponse: payload,
  };
}

export async function cancelMyInvoisDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceCancellationResult> {
  const credentials = getCredentials(input.connection);
  if (!credentials.cancelUrl) {
    throw new Error("MyInvois cancellation requires a cancellation URL.");
  }

  const accessToken = await getAccessToken(input.connection);
  const response = await fetch(credentials.cancelUrl, {
    method: "POST",
    headers: buildAuthHeaders(input.connection, accessToken),
    body: JSON.stringify({
      provider: "MYINVOIS",
      submissionId: input.submissionId,
    }),
  });
  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const message = pickErrorMessage(payload) || `MyInvois cancellation failed with status ${response.status}.`;
    throw new Error(message);
  }

  return {
    status: "CANCELLED",
    rawResponse: payload,
  };
}

export function clearMyInvoisTokenCache() {
  tokenCache.clear();
}

export function getMyInvoisBaseUrlForConnection(connection?: EInvoiceConnectionConfig | null) {
  return getBaseUrl(connection);
}

export function logMyInvoisTransportWarning(message: string, meta?: Record<string, unknown>) {
  log("warn", message, meta);
}
