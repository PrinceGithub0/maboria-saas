
import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoicePayloadBuildResult,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "@/lib/einvoicing/types";

const MD_SFS_PORTAL_URL = "https://sfs.md";
const MD_EFACTURA_URL = "https://sfs.md/ro/stiri/in-atentia-utilizatorilor-sia-e-factura";
const MD_MPASS_URL = "https://mpass.gov.md";

type MdEFacturaCredentials = {
  taxpayerCode: string;
  username?: string;
  password?: string;
  certificatePem?: string;
  privateKeyPem?: string;
  submissionUrl?: string;
  statusUrl?: string;
  cancelUrl?: string;
};

const trim = (value: unknown) => String(value || "").trim();

export function getMdEFacturaCredentials(
  connection?: EInvoiceConnectionConfig | null
): MdEFacturaCredentials {
  const credentials = (connection?.credentials || {}) as Record<string, unknown>;
  const taxpayerCode = trim(credentials.taxpayerCode || credentials.taxId);

  if (!taxpayerCode) {
    throw new Error("Moldova e-Factura requires a taxpayer code before endpoint preparation.");
  }

  return {
    taxpayerCode,
    ...(trim(credentials.username) ? { username: trim(credentials.username) } : {}),
    ...(trim(credentials.password) ? { password: trim(credentials.password) } : {}),
    ...(trim(credentials.certificatePem) ? { certificatePem: trim(credentials.certificatePem) } : {}),
    ...(trim(credentials.privateKeyPem) ? { privateKeyPem: trim(credentials.privateKeyPem) } : {}),
    ...(trim(credentials.submissionUrl) ? { submissionUrl: trim(credentials.submissionUrl) } : {}),
    ...(trim(credentials.statusUrl) ? { statusUrl: trim(credentials.statusUrl) } : {}),
    ...(trim(credentials.cancelUrl) ? { cancelUrl: trim(credentials.cancelUrl) } : {}),
  };
}

export function buildMdSfsPortalUrl() {
  return MD_SFS_PORTAL_URL;
}

export function buildMdEFacturaUrl() {
  return MD_EFACTURA_URL;
}

export function buildMdMPassUrl() {
  return MD_MPASS_URL;
}

export function buildMdEFacturaPreparation(connection?: EInvoiceConnectionConfig | null) {
  const credentials = getMdEFacturaCredentials(connection);
  const submissionUrl = trim(credentials.submissionUrl);
  const statusUrl = trim(credentials.statusUrl);
  const cancelUrl = trim(credentials.cancelUrl);
  const requiredArtifacts = ["taxpayer code"];
  const presentArtifacts = [
    "taxpayer code",
    credentials.username ? "username" : null,
    credentials.password ? "password" : null,
    credentials.certificatePem ? "certificate" : null,
    credentials.privateKeyPem ? "private key" : null,
    submissionUrl ? "submission URL" : null,
    statusUrl ? "status URL" : null,
    cancelUrl ? "cancellation URL" : null,
  ].filter(Boolean) as string[];
  const onboardingReady = true;
  const signingReady = Boolean(credentials.certificatePem && credentials.privateKeyPem);
  const transmissionReady = Boolean(credentials.username && credentials.password && signingReady && submissionUrl);
  const liveSubmissionReady = transmissionReady;
  const liveSubmissionBlockedReason = liveSubmissionReady
    ? null
    : "Live Moldova e-Factura submission requires SFS credentials, signing material, and a submission URL.";
  const missingArtifacts = [
    !credentials.username ? "username" : null,
    !credentials.password ? "password" : null,
    !credentials.certificatePem ? "certificate" : null,
    !credentials.privateKeyPem ? "private key" : null,
    !submissionUrl ? "submission URL" : null,
  ].filter(Boolean) as string[];

  return {
    country: "MD" as const,
    sandbox: connection?.sandbox !== false,
    portalUrl: buildMdSfsPortalUrl(),
    eFacturaUrl: buildMdEFacturaUrl(),
    mpassUrl: buildMdMPassUrl(),
    requiredArtifacts,
    presentArtifacts,
    onboardingReady,
    signingReady,
    transmissionReady,
    liveSubmissionReady,
    liveSubmissionBlockedReason,
    missingArtifacts,
    nextActions: [
      !credentials.username ? "Add the SFS username used for Moldova e-Factura." : null,
      !credentials.password ? "Add the SFS password used for Moldova e-Factura." : null,
      !credentials.certificatePem ? "Attach the certificate used for signed Moldova e-Factura documents." : null,
      !credentials.privateKeyPem ? "Attach the private key used for signed Moldova e-Factura documents." : null,
      !submissionUrl ? "Add the Moldova e-Factura submission URL." : null,
      !statusUrl ? "Add a status URL if you want automatic Moldova polling." : null,
      !cancelUrl ? "Add a cancellation URL if you want automated Moldova cancellation." : null,
      liveSubmissionBlockedReason,
    ].filter(Boolean) as string[],
    notes: [
      "Moldova e-Factura commonly relies on authenticated SFS access and structured document exchange.",
      "Live Moldova e-Factura submission can run when the workspace has a submission URL configured.",
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
  if (normalized === "ACCEPTED" || normalized === "AUTHORIZED" || normalized === "SUCCESS") return "ACCEPTED";
  if (normalized === "QUEUED" || normalized === "PENDING") return "QUEUED";
  return "SUBMITTED";
}

function normalizeStatusResult(value: unknown): EInvoiceStatusResult["status"] {
  const normalized = trim(value).toUpperCase();
  if (normalized === "ACCEPTED" || normalized === "AUTHORIZED" || normalized === "SUCCESS") return "ACCEPTED";
  if (normalized === "REJECTED" || normalized === "FAILED" || normalized === "ERROR") return "REJECTED";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "CANCELLED";
  if (normalized === "QUEUED" || normalized === "PENDING") return "QUEUED";
  return "SUBMITTED";
}

export async function submitMdEFacturaDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  payload: EInvoicePayloadBuildResult;
}): Promise<EInvoiceSubmissionResult> {
  const credentials = getMdEFacturaCredentials(input.connection);
  if (!credentials.submissionUrl) {
    throw new Error("Moldova e-Factura live submission requires a submission URL.");
  }

  const response = await fetch(credentials.submissionUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "MD_EFACTURA",
      taxpayerCode: credentials.taxpayerCode,
      externalId: input.payload.externalId,
      format: input.payload.format,
      payload: input.payload.payload,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `Moldova submission failed with status ${response.status}.`);
  }

  const submissionId =
    trim(parsed?.submissionId || parsed?.requestId || parsed?.identifier || input.payload.externalId) ||
    input.payload.externalId;
  const providerReference =
    trim(parsed?.providerReference || parsed?.requestId || parsed?.identifier || submissionId) || submissionId;

  return {
    status: normalizeSubmissionStatus(parsed?.status),
    submissionId,
    providerReference,
    rawResponse: parsed,
  };
}

export async function getMdEFacturaStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceStatusResult> {
  const credentials = getMdEFacturaCredentials(input.connection);
  if (!credentials.statusUrl) {
    return {
      status: "SUBMITTED",
      providerReference: input.submissionId,
      rawResponse: null,
      errorMessage: "Moldova e-Factura status sync endpoint is not configured for this workspace.",
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
    throw new Error(trim(parsed?.message || parsed?.error) || `Moldova status lookup failed with status ${response.status}.`);
  }

  return {
    status: normalizeStatusResult(parsed?.status),
    providerReference:
      trim(parsed?.providerReference || parsed?.requestId || parsed?.identifier || input.submissionId) ||
      input.submissionId,
    rawResponse: parsed,
    errorMessage: trim(parsed?.errorMessage || parsed?.message) || null,
  };
}

export async function cancelMdEFacturaDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceCancellationResult> {
  const credentials = getMdEFacturaCredentials(input.connection);
  if (!credentials.cancelUrl) {
    throw new Error("Moldova e-Factura cancellation requires a cancellation URL.");
  }

  const response = await fetch(credentials.cancelUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "MD_EFACTURA",
      taxpayerCode: credentials.taxpayerCode,
      submissionId: input.submissionId,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `Moldova cancellation failed with status ${response.status}.`);
  }

  return {
    status: "CANCELLED",
    rawResponse: parsed,
  };
}
