import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoicePayloadBuildResult,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "@/lib/einvoicing/types";

const SAT_BASE_URL = "https://www.sat.gob.mx";
const CFDI_PORTAL_URL = "https://www.sat.gob.mx/aplicación/53027/factura-electronica";
const PAC_REGISTRY_URL = "https://www.sat.gob.mx/personas/factura-electronica";

type CfdiCredentials = {
  rfc: string;
  ciec?: string;
  csdCertificatePem?: string;
  csdPrivateKeyPem?: string;
  csdPrivateKeyPassword?: string;
  pacUrl?: string;
  pacStatusUrl?: string;
  pacCancelUrl?: string;
};

type CfdiTransmissionPreparation = {
  country: "MX";
  sandbox: boolean;
  portalUrl: string;
  pacRegistryUrl: string;
  guidesUrl: string;
  liveSubmissionReady: boolean;
  liveSubmissionBlockedReason: string | null;
  requiredArtifacts: string[];
  presentArtifacts: string[];
  missingArtifacts: string[];
  notes: string[];
};

const trim = (value: unknown) => String(value || "").trim();

export function getCfdiCredentials(connection?: EInvoiceConnectionConfig | null): CfdiCredentials {
  const credentials = (connection?.credentials || {}) as Record<string, unknown>;
  const rfc = trim(credentials.rfc || credentials.taxId);
  if (!rfc) {
    throw new Error("CFDI requires an RFC before onboarding or endpoint preparation.");
  }

  return {
    rfc,
    ...(trim(credentials.ciec) ? { ciec: trim(credentials.ciec) } : {}),
    ...(trim(credentials.csdCertificatePem) ? { csdCertificatePem: trim(credentials.csdCertificatePem) } : {}),
    ...(trim(credentials.csdPrivateKeyPem) ? { csdPrivateKeyPem: trim(credentials.csdPrivateKeyPem) } : {}),
    ...(trim(credentials.csdPrivateKeyPassword) ? { csdPrivateKeyPassword: trim(credentials.csdPrivateKeyPassword) } : {}),
    ...(trim(credentials.pacUrl) ? { pacUrl: trim(credentials.pacUrl) } : {}),
    ...(trim(credentials.pacStatusUrl) ? { pacStatusUrl: trim(credentials.pacStatusUrl) } : {}),
    ...(trim(credentials.pacCancelUrl) ? { pacCancelUrl: trim(credentials.pacCancelUrl) } : {}),
  };
}

export function buildCfdiPortalUrl() {
  return CFDI_PORTAL_URL;
}

export function buildCfdiPacRegistryUrl() {
  return PAC_REGISTRY_URL;
}

export function buildCfdiGuidesUrl() {
  return `${SAT_BASE_URL}/consultas/57964/consulta-de-documentacion-tecnica`;
}

export function buildCfdiSandboxMetadata(connection?: EInvoiceConnectionConfig | null) {
  const credentials = getCfdiCredentials(connection);
  return {
    country: "MX" as const,
    sandbox: connection?.sandbox !== false,
    portalUrl: buildCfdiPortalUrl(),
    pacRegistryUrl: buildCfdiPacRegistryUrl(),
    guidesUrl: buildCfdiGuidesUrl(),
    requiredArtifacts: ["RFC"],
    presentArtifacts: [credentials.rfc, credentials.ciec ? "CIEC" : null, credentials.csdCertificatePem ? "CSD certificate" : null, credentials.csdPrivateKeyPem ? "CSD private key" : null].filter(Boolean) as string[],
    notes: [
      "CFDI production typically depends on a PAC and signed CSD material.",
      "This scaffold only prepares credential and endpoint handling.",
    ],
  };
}

export function buildCfdiTransmissionPreparation(connection?: EInvoiceConnectionConfig | null): CfdiTransmissionPreparation {
  const credentials = (connection?.credentials || {}) as Record<string, unknown>;
  const rfc = trim(credentials.rfc || credentials.taxId);
  const ciec = trim(credentials.ciec);
  const csdCertificatePem = trim(credentials.csdCertificatePem);
  const csdPrivateKeyPem = trim(credentials.csdPrivateKeyPem);
  const csdPrivateKeyPassword = trim(credentials.csdPrivateKeyPassword);
  const pacUrl = trim(credentials.pacUrl);
  const pacCancelUrl = trim(credentials.pacCancelUrl);
  const presentArtifacts = [
    rfc ? "RFC" : null,
    ciec ? "CIEC" : null,
    csdCertificatePem ? "CSD certificate" : null,
    csdPrivateKeyPem ? "CSD private key" : null,
    csdPrivateKeyPassword ? "CSD key password" : null,
    pacUrl ? "PAC URL" : null,
    pacCancelUrl ? "PAC cancellation URL" : null,
  ].filter(Boolean) as string[];

  const missingArtifacts = [
    rfc ? null : "RFC",
    ciec ? null : "CIEC",
    csdCertificatePem ? null : "CSD certificate",
    csdPrivateKeyPem ? null : "CSD private key",
    csdPrivateKeyPassword ? null : "CSD key password",
    pacUrl ? null : "PAC URL",
  ].filter(Boolean) as string[];
  const liveSubmissionReady =
    Boolean(rfc) &&
    Boolean(csdCertificatePem) &&
    Boolean(csdPrivateKeyPem) &&
    Boolean(csdPrivateKeyPassword) &&
    Boolean(pacUrl);

  return {
    country: "MX",
    sandbox: connection?.sandbox !== false,
    portalUrl: buildCfdiPortalUrl(),
    pacRegistryUrl: buildCfdiPacRegistryUrl(),
    guidesUrl: buildCfdiGuidesUrl(),
    liveSubmissionReady,
    liveSubmissionBlockedReason: liveSubmissionReady
      ? null
      : "Live CFDI submission requires RFC, CSD certificate, CSD private key, key password, and a PAC submission URL.",
    requiredArtifacts: ["RFC", "CSD certificate", "CSD private key", "CSD key password"],
    presentArtifacts,
    missingArtifacts,
    notes: [
      "Mexico CFDI production typically depends on a PAC, signed CSD material, and SAT-aligned XML stamping.",
      "Live PAC submission can be used when a PAC submission URL is configured for the workspace.",
      "PAC status sync remains provider-specific and may require a separate status endpoint.",
      "PAC cancellation can be used when a PAC cancellation endpoint is configured for the workspace.",
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
  if (normalized === "ACCEPTED" || normalized === "STAMPED" || normalized === "SUCCESS") {
    return "ACCEPTED";
  }
  if (normalized === "QUEUED" || normalized === "PENDING") {
    return "QUEUED";
  }
  return "SUBMITTED";
}

function normalizeStatusResult(value: unknown): EInvoiceStatusResult["status"] {
  const normalized = trim(value).toUpperCase();
  if (normalized === "ACCEPTED" || normalized === "STAMPED" || normalized === "SUCCESS") return "ACCEPTED";
  if (normalized === "REJECTED" || normalized === "FAILED" || normalized === "ERROR") return "REJECTED";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "CANCELLED";
  if (normalized === "QUEUED" || normalized === "PENDING") return "QUEUED";
  return "SUBMITTED";
}

export async function submitCfdiDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  payload: EInvoicePayloadBuildResult;
}): Promise<EInvoiceSubmissionResult> {
  const credentials = getCfdiCredentials(input.connection);
  if (!credentials.pacUrl) {
    throw new Error("CFDI live submission requires a PAC URL.");
  }

  const response = await fetch(credentials.pacUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "MX_CFDI",
      rfc: credentials.rfc,
      payload: input.payload.payload,
      externalId: input.payload.externalId,
      format: input.payload.format,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `CFDI submission failed with status ${response.status}.`);
  }

  const submissionId =
    trim(parsed?.submissionId || parsed?.uuid || parsed?.folio || input.payload.externalId) || input.payload.externalId;
  const providerReference = trim(parsed?.providerReference || parsed?.uuid || submissionId) || submissionId;

  return {
    status: normalizeSubmissionStatus(parsed?.status),
    submissionId,
    providerReference,
    rawResponse: parsed,
  };
}

export async function getCfdiSubmissionStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceStatusResult> {
  const credentials = getCfdiCredentials(input.connection);
  if (!credentials.pacStatusUrl) {
    return {
      status: "SUBMITTED",
      providerReference: input.submissionId,
      rawResponse: null,
      errorMessage: "CFDI status sync endpoint is not configured for this workspace.",
    };
  }

  const statusUrl = new URL(credentials.pacStatusUrl);
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
    throw new Error(trim(parsed?.message || parsed?.error) || `CFDI status lookup failed with status ${response.status}.`);
  }

  return {
    status: normalizeStatusResult(parsed?.status),
    providerReference: trim(parsed?.providerReference || parsed?.uuid || input.submissionId) || input.submissionId,
    rawResponse: parsed,
    errorMessage: trim(parsed?.errorMessage || parsed?.message) || null,
  };
}

export async function cancelCfdiDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceCancellationResult> {
  const credentials = getCfdiCredentials(input.connection);
  if (!credentials.pacCancelUrl) {
    throw new Error("CFDI cancellation requires a PAC cancellation URL.");
  }

  const response = await fetch(credentials.pacCancelUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "MX_CFDI",
      rfc: credentials.rfc,
      submissionId: input.submissionId,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `CFDI cancellation failed with status ${response.status}.`);
  }

  return {
    status: "CANCELLED",
    rawResponse: parsed,
  };
}
