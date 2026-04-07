import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoicePayloadBuildResult,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "@/lib/einvoicing/types";

const SUNAT_PORTAL_URL = "https://www.sunat.gob.pe";
const SUNAT_SOL_URL = "https://www.sunat.gob.pe/sol.html";
const SUNAT_EFACTURA_URL = "https://cpe.sunat.gob.pe";

type SunatCredentials = {
  ruc: string;
  solUser?: string;
  solPassword?: string;
  certificatePem?: string;
  privateKeyPem?: string;
  submissionUrl?: string;
  statusUrl?: string;
  cancelUrl?: string;
};

const trim = (value: unknown) => String(value || "").trim();

export function getSunatCredentials(connection?: EInvoiceConnectionConfig | null): SunatCredentials {
  const credentials = (connection?.credentials || {}) as Record<string, unknown>;
  const ruc = trim(credentials.ruc || credentials.taxId);
  if (!ruc) {
    throw new Error("SUNAT requires a RUC before endpoint preparation.");
  }

  return {
    ruc,
    ...(trim(credentials.solUser) ? { solUser: trim(credentials.solUser) } : {}),
    ...(trim(credentials.solPassword) ? { solPassword: trim(credentials.solPassword) } : {}),
    ...(trim(credentials.certificatePem) ? { certificatePem: trim(credentials.certificatePem) } : {}),
    ...(trim(credentials.privateKeyPem) ? { privateKeyPem: trim(credentials.privateKeyPem) } : {}),
    ...(trim(credentials.submissionUrl) ? { submissionUrl: trim(credentials.submissionUrl) } : {}),
    ...(trim(credentials.statusUrl) ? { statusUrl: trim(credentials.statusUrl) } : {}),
    ...(trim(credentials.cancelUrl) ? { cancelUrl: trim(credentials.cancelUrl) } : {}),
  };
}

export function buildSunatPortalUrl() {
  return SUNAT_PORTAL_URL;
}

export function buildSunatSolUrl() {
  return SUNAT_SOL_URL;
}

export function buildSunatEFacturaUrl() {
  return SUNAT_EFACTURA_URL;
}

export function buildSunatSigningPreparation(connection?: EInvoiceConnectionConfig | null) {
  const credentials = getSunatCredentials(connection);
  const submissionUrl = trim(credentials.submissionUrl);
  const statusUrl = trim(credentials.statusUrl);
  const cancelUrl = trim(credentials.cancelUrl);
  const presentArtifacts = [
    "RUC",
    credentials.solUser ? "SOL user" : null,
    credentials.solPassword ? "SOL password" : null,
    credentials.certificatePem ? "certificate" : null,
    credentials.privateKeyPem ? "private key" : null,
    submissionUrl ? "submission URL" : null,
    statusUrl ? "status URL" : null,
    cancelUrl ? "cancellation URL" : null,
  ].filter(Boolean) as string[];
  const requiredArtifacts = ["RUC"];
  const onboardingReady = true;
  const signingReady = Boolean(credentials.certificatePem && credentials.privateKeyPem);
  const transmissionReady = Boolean(credentials.solUser && credentials.solPassword && signingReady && submissionUrl);
  const liveSubmissionReady = transmissionReady;
  const liveSubmissionBlockedReason = liveSubmissionReady
    ? null
    : "Live SUNAT submission requires SOL credentials, signing material, and a submission URL.";
  const missingArtifacts = [
    !credentials.solUser ? "SOL user" : null,
    !credentials.solPassword ? "SOL password" : null,
    !credentials.certificatePem ? "certificate" : null,
    !credentials.privateKeyPem ? "private key" : null,
    !submissionUrl ? "submission URL" : null,
  ].filter(Boolean) as string[];

  return {
    country: "PE" as const,
    sandbox: connection?.sandbox !== false,
    portalUrl: buildSunatPortalUrl(),
    solUrl: buildSunatSolUrl(),
    eFacturaUrl: buildSunatEFacturaUrl(),
    requiredArtifacts,
    presentArtifacts,
    onboardingReady,
    signingReady,
    transmissionReady,
    liveSubmissionReady,
    liveSubmissionBlockedReason,
    missingArtifacts,
    nextActions: [
      !credentials.solUser ? "Add the SOL user for SUNAT access." : null,
      !credentials.solPassword ? "Add the SOL password for SUNAT access." : null,
      !credentials.certificatePem ? "Attach the certificate used for signed SUNAT XML." : null,
      !credentials.privateKeyPem ? "Attach the private key used for signed SUNAT XML." : null,
      !submissionUrl ? "Add the SUNAT or OSE submission URL." : null,
      !statusUrl ? "Add a status URL if you want automatic SUNAT polling." : null,
      !cancelUrl ? "Add a cancellation URL if you want automated SUNAT cancellation." : null,
      liveSubmissionBlockedReason,
    ].filter(Boolean) as string[],
    notes: [
      "SUNAT electronic invoicing typically depends on SOL credentials and certificate-backed issuance.",
      "Live SUNAT submission can run when the workspace has a submission URL configured.",
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

export async function submitSunatDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  payload: EInvoicePayloadBuildResult;
}): Promise<EInvoiceSubmissionResult> {
  const credentials = getSunatCredentials(input.connection);
  if (!credentials.submissionUrl) {
    throw new Error("SUNAT live submission requires a submission URL.");
  }

  const response = await fetch(credentials.submissionUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "PE_SUNAT",
      ruc: credentials.ruc,
      externalId: input.payload.externalId,
      format: input.payload.format,
      payload: input.payload.payload,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `SUNAT submission failed with status ${response.status}.`);
  }

  const submissionId =
    trim(parsed?.submissionId || parsed?.ticket || parsed?.cdrId || input.payload.externalId) || input.payload.externalId;
  const providerReference =
    trim(parsed?.providerReference || parsed?.ticket || parsed?.cdrId || submissionId) || submissionId;

  return {
    status: normalizeSubmissionStatus(parsed?.status),
    submissionId,
    providerReference,
    rawResponse: parsed,
  };
}

export async function getSunatSubmissionStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceStatusResult> {
  const credentials = getSunatCredentials(input.connection);
  if (!credentials.statusUrl) {
    return {
      status: "SUBMITTED",
      providerReference: input.submissionId,
      rawResponse: null,
      errorMessage: "SUNAT status sync endpoint is not configured for this workspace.",
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
    throw new Error(trim(parsed?.message || parsed?.error) || `SUNAT status lookup failed with status ${response.status}.`);
  }

  return {
    status: normalizeStatusResult(parsed?.status),
    providerReference: trim(parsed?.providerReference || parsed?.ticket || parsed?.cdrId || input.submissionId) || input.submissionId,
    rawResponse: parsed,
    errorMessage: trim(parsed?.errorMessage || parsed?.message) || null,
  };
}

export async function cancelSunatDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceCancellationResult> {
  const credentials = getSunatCredentials(input.connection);
  if (!credentials.cancelUrl) {
    throw new Error("SUNAT cancellation requires a cancellation URL.");
  }

  const response = await fetch(credentials.cancelUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "PE_SUNAT",
      ruc: credentials.ruc,
      submissionId: input.submissionId,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `SUNAT cancellation failed with status ${response.status}.`);
  }

  return {
    status: "CANCELLED",
    rawResponse: parsed,
  };
}
