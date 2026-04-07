
import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoicePayloadBuildResult,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "@/lib/einvoicing/types";

const NAV_PORTAL_URL = "https://nav.gov.hu";
const NAV_ONLINE_INVOICE_URL = "https://nav.gov.hu/ugyfeliranytu/nezzen-utana/inf_fuz";
const NAV_API_DOCS_URL = "https://nav.gov.hu/pfile/file?path=/szamlainfo/online-szamla-api-dokumentacio";

type NavOnlineInvoiceCredentials = {
  taxNumber: string;
  technicalUserName?: string;
  technicalUserPassword?: string;
  signingKey?: string;
  exchangeKey?: string;
  submissionUrl?: string;
  statusUrl?: string;
  cancelUrl?: string;
};

const trim = (value: unknown) => String(value || "").trim();

export function getNavOnlineInvoiceCredentials(
  connection?: EInvoiceConnectionConfig | null
): NavOnlineInvoiceCredentials {
  const credentials = (connection?.credentials || {}) as Record<string, unknown>;
  const taxNumber = trim(credentials.taxNumber || credentials.taxId);

  if (!taxNumber) {
    throw new Error("NAV Online Invoice requires a tax number before endpoint preparation.");
  }

  return {
    taxNumber,
    ...(trim(credentials.technicalUserName) ? { technicalUserName: trim(credentials.technicalUserName) } : {}),
    ...(trim(credentials.technicalUserPassword)
      ? { technicalUserPassword: trim(credentials.technicalUserPassword) }
      : {}),
    ...(trim(credentials.signingKey) ? { signingKey: trim(credentials.signingKey) } : {}),
    ...(trim(credentials.exchangeKey) ? { exchangeKey: trim(credentials.exchangeKey) } : {}),
    ...(trim(credentials.submissionUrl) ? { submissionUrl: trim(credentials.submissionUrl) } : {}),
    ...(trim(credentials.statusUrl) ? { statusUrl: trim(credentials.statusUrl) } : {}),
    ...(trim(credentials.cancelUrl) ? { cancelUrl: trim(credentials.cancelUrl) } : {}),
  };
}

export function buildNavPortalUrl() {
  return NAV_PORTAL_URL;
}

export function buildNavOnlineInvoiceUrl() {
  return NAV_ONLINE_INVOICE_URL;
}

export function buildNavApiDocsUrl() {
  return NAV_API_DOCS_URL;
}

export function buildNavReportingPreparation(connection?: EInvoiceConnectionConfig | null) {
  const credentials = getNavOnlineInvoiceCredentials(connection);
  const submissionUrl = trim(credentials.submissionUrl);
  const statusUrl = trim(credentials.statusUrl);
  const cancelUrl = trim(credentials.cancelUrl);
  const requiredArtifacts = ["tax number"];
  const presentArtifacts = [
    "tax number",
    credentials.technicalUserName ? "technical user" : null,
    credentials.technicalUserPassword ? "technical user password" : null,
    credentials.signingKey ? "signing key" : null,
    credentials.exchangeKey ? "exchange key" : null,
    submissionUrl ? "submission URL" : null,
    statusUrl ? "status URL" : null,
    cancelUrl ? "cancellation URL" : null,
  ].filter(Boolean) as string[];
  const onboardingReady = true;
  const signingReady = Boolean(credentials.signingKey && credentials.exchangeKey);
  const transmissionReady = Boolean(
    credentials.technicalUserName && credentials.technicalUserPassword && signingReady && submissionUrl
  );
  const liveSubmissionReady = transmissionReady;
  const liveSubmissionBlockedReason = liveSubmissionReady
    ? null
    : "Live NAV reporting requires technical-user credentials, signing keys, and a submission URL.";
  const missingArtifacts = [
    !credentials.technicalUserName ? "technical user" : null,
    !credentials.technicalUserPassword ? "technical user password" : null,
    !credentials.signingKey ? "signing key" : null,
    !credentials.exchangeKey ? "exchange key" : null,
    !submissionUrl ? "submission URL" : null,
  ].filter(Boolean) as string[];

  return {
    country: "HU" as const,
    sandbox: connection?.sandbox !== false,
    portalUrl: buildNavPortalUrl(),
    onlineInvoiceUrl: buildNavOnlineInvoiceUrl(),
    apiDocsUrl: buildNavApiDocsUrl(),
    requiredArtifacts,
    presentArtifacts,
    onboardingReady,
    signingReady,
    transmissionReady,
    liveSubmissionReady,
    liveSubmissionBlockedReason,
    missingArtifacts,
    nextActions: [
      !credentials.technicalUserName ? "Add the NAV technical user name." : null,
      !credentials.technicalUserPassword ? "Add the NAV technical user password." : null,
      !credentials.signingKey ? "Add the NAV signing key." : null,
      !credentials.exchangeKey ? "Add the NAV exchange key." : null,
      !submissionUrl ? "Add the NAV reporting submission URL." : null,
      !statusUrl ? "Add a status URL if you want automatic NAV polling." : null,
      !cancelUrl ? "Add a cancellation URL if you want automated NAV cancellation." : null,
      liveSubmissionBlockedReason,
    ].filter(Boolean) as string[],
    notes: [
      "Hungary NAV Online Invoice typically relies on technical-user credentials and signed reporting requests.",
      "Live NAV reporting can run when the workspace has a reporting endpoint configured.",
      "Status sync remains optional and may require a separate polling endpoint.",
      "Cancellation can run when the workspace has a dedicated cancellation endpoint.",
    ],
  };
}

function parseJsonSafe(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function normalizeSubmissionStatus(value: unknown): EInvoiceSubmissionResult["status"] {
  const normalized = trim(value).toUpperCase();
  if (normalized === "ACCEPTED" || normalized === "SUCCESS") return "ACCEPTED";
  if (normalized === "QUEUED" || normalized === "PENDING") return "QUEUED";
  return "SUBMITTED";
}

function normalizeStatusResult(value: unknown): EInvoiceStatusResult["status"] {
  const normalized = trim(value).toUpperCase();
  if (normalized === "ACCEPTED" || normalized === "SUCCESS") return "ACCEPTED";
  if (normalized === "REJECTED" || normalized === "FAILED" || normalized === "ERROR") return "REJECTED";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "CANCELLED";
  if (normalized === "QUEUED" || normalized === "PENDING") return "QUEUED";
  return "SUBMITTED";
}

export async function submitNavOnlineInvoiceReport(input: {
  connection?: EInvoiceConnectionConfig | null;
  payload: EInvoicePayloadBuildResult;
}): Promise<EInvoiceSubmissionResult> {
  const credentials = getNavOnlineInvoiceCredentials(input.connection);
  if (!credentials.submissionUrl) {
    throw new Error("NAV live reporting requires a submission URL.");
  }

  const response = await fetch(credentials.submissionUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "HU_NAV",
      taxNumber: credentials.taxNumber,
      technicalUserName: credentials.technicalUserName || null,
      externalId: input.payload.externalId,
      format: input.payload.format,
      payload: input.payload.payload,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `NAV submission failed with status ${response.status}.`);
  }

  const submissionId =
    trim(parsed?.submissionId || parsed?.transactionId || parsed?.requestId || input.payload.externalId) ||
    input.payload.externalId;
  const providerReference =
    trim(parsed?.providerReference || parsed?.transactionId || parsed?.requestId || submissionId) || submissionId;

  return {
    status: normalizeSubmissionStatus(parsed?.status),
    submissionId,
    providerReference,
    rawResponse: parsed,
  };
}

export async function getNavOnlineInvoiceStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceStatusResult> {
  const credentials = getNavOnlineInvoiceCredentials(input.connection);
  if (!credentials.statusUrl) {
    return {
      status: "SUBMITTED",
      providerReference: input.submissionId,
      rawResponse: null,
      errorMessage: "NAV status sync endpoint is not configured for this workspace.",
    };
  }

  const statusUrl = new URL(credentials.statusUrl);
  statusUrl.searchParams.set("submissionId", input.submissionId);
  const response = await fetch(statusUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `NAV status lookup failed with status ${response.status}.`);
  }

  return {
    status: normalizeStatusResult(parsed?.status),
    providerReference:
      trim(parsed?.providerReference || parsed?.transactionId || parsed?.requestId || input.submissionId) ||
      input.submissionId,
    rawResponse: parsed,
    errorMessage: trim(parsed?.errorMessage || parsed?.message) || null,
  };
}

export async function cancelNavOnlineInvoiceReport(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceCancellationResult> {
  const credentials = getNavOnlineInvoiceCredentials(input.connection);
  if (!credentials.cancelUrl) {
    throw new Error("NAV cancellation requires a cancellation URL.");
  }

  const response = await fetch(credentials.cancelUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "HU_NAV",
      taxNumber: credentials.taxNumber,
      submissionId: input.submissionId,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `NAV cancellation failed with status ${response.status}.`);
  }

  return {
    status: "CANCELLED",
    rawResponse: parsed,
  };
}
