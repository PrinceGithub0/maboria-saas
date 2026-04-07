import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoicePayloadBuildResult,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "@/lib/einvoicing/types";

const SII_PORTAL_URL = "https://www.sii.cl";
const SII_FACTURA_ELECTRONICA_URL = "https://www.sii.cl/factura_electronica";

type DteCredentials = {
  rut: string;
  certificatePem?: string;
  privateKeyPem?: string;
  siiUser?: string;
  siiPassword?: string;
  taxId?: string;
  submissionUrl?: string;
  statusUrl?: string;
  cancelUrl?: string;
};

type DteTransmissionPreparation = {
  country: "CL";
  sandbox: boolean;
  portalUrl: string;
  facturaElectronicaUrl: string;
  requiredArtifacts: string[];
  presentArtifacts: string[];
  missingArtifacts: string[];
  onboardingReady: boolean;
  signingReady: boolean;
  transmissionReady: boolean;
  liveSubmissionReady: boolean;
  liveSubmissionBlockedReason: string | null;
  nextActions: string[];
  notes: string[];
};

const trim = (value: unknown) => String(value || "").trim();

function getConnectionCredentials(connection?: EInvoiceConnectionConfig | null) {
  return (connection?.credentials || {}) as Record<string, unknown>;
}

export function getDteCredentials(connection?: EInvoiceConnectionConfig | null): DteCredentials {
  const credentials = getConnectionCredentials(connection);
  const rut = trim(credentials.rut || credentials.taxId);
  if (!rut) {
    throw new Error("DTE requires a RUT before endpoint preparation.");
  }

  return {
    rut,
    ...(trim(credentials.certificatePem) ? { certificatePem: trim(credentials.certificatePem) } : {}),
    ...(trim(credentials.privateKeyPem) ? { privateKeyPem: trim(credentials.privateKeyPem) } : {}),
    ...(trim(credentials.siiUser) ? { siiUser: trim(credentials.siiUser) } : {}),
    ...(trim(credentials.siiPassword) ? { siiPassword: trim(credentials.siiPassword) } : {}),
    ...(trim(credentials.taxId) ? { taxId: trim(credentials.taxId) } : {}),
    ...(trim(credentials.submissionUrl) ? { submissionUrl: trim(credentials.submissionUrl) } : {}),
    ...(trim(credentials.statusUrl) ? { statusUrl: trim(credentials.statusUrl) } : {}),
    ...(trim(credentials.cancelUrl) ? { cancelUrl: trim(credentials.cancelUrl) } : {}),
  };
}

export function buildDtePortalUrl() {
  return SII_PORTAL_URL;
}

export function buildDteFacturaElectronicaUrl() {
  return SII_FACTURA_ELECTRONICA_URL;
}

export function buildDteTransmissionPreparation(
  connection?: EInvoiceConnectionConfig | null
): DteTransmissionPreparation {
  const credentials = getConnectionCredentials(connection);
  const rut = trim(credentials.rut || credentials.taxId);
  const certificatePem = trim(credentials.certificatePem);
  const privateKeyPem = trim(credentials.privateKeyPem);
  const siiUser = trim(credentials.siiUser);
  const siiPassword = trim(credentials.siiPassword);
  const submissionUrl = trim(credentials.submissionUrl);
  const statusUrl = trim(credentials.statusUrl);
  const cancelUrl = trim(credentials.cancelUrl);
  const requiredArtifacts = ["RUT", "SII user", "SII password", "certificate", "private key", "submission URL"];
  const presentArtifacts = [
    rut ? "RUT" : null,
    siiUser ? "SII user" : null,
    siiPassword ? "SII password" : null,
    certificatePem ? "certificate" : null,
    privateKeyPem ? "private key" : null,
    submissionUrl ? "submission URL" : null,
    statusUrl ? "status URL" : null,
    cancelUrl ? "cancellation URL" : null,
  ].filter(Boolean) as string[];
  const missingArtifacts = requiredArtifacts.filter((artifact) => {
    if (artifact === "RUT") return !rut;
    if (artifact === "SII user") return !siiUser;
    if (artifact === "SII password") return !siiPassword;
    if (artifact === "certificate") return !certificatePem;
    if (artifact === "private key") return !privateKeyPem;
    if (artifact === "submission URL") return !submissionUrl;
    return false;
  });

  const onboardingReady = Boolean(rut && siiUser && siiPassword);
  const signingReady = Boolean(rut && certificatePem && privateKeyPem);
  const transmissionReady = Boolean(onboardingReady && signingReady && submissionUrl);
  const liveSubmissionReady = transmissionReady;
  const liveSubmissionBlockedReason = liveSubmissionReady
    ? null
    : "Live DTE submission requires RUT, SII credentials, signing material, and a submission URL.";
  const nextActions: string[] = [];

  if (!rut) nextActions.push("Add the company's RUT.");
  if (!siiUser) nextActions.push("Store the SII user for portal access.");
  if (!siiPassword) nextActions.push("Store the SII password for portal access.");
  if (!certificatePem) nextActions.push("Upload the Chile signing certificate.");
  if (!privateKeyPem) nextActions.push("Store the Chile signing private key.");
  if (!submissionUrl) nextActions.push("Add the SII or accredited DTE submission URL.");
  if (!statusUrl) nextActions.push("Add a status URL if you want automatic DTE polling.");
  if (!cancelUrl) nextActions.push("Add a cancellation URL if you want automated DTE cancellation.");
  if (rut && siiUser && siiPassword && certificatePem && privateKeyPem) {
    nextActions.push("Confirm the SII environment and document flow before live submission.");
  }
  if (liveSubmissionBlockedReason) {
    nextActions.push(liveSubmissionBlockedReason);
  }

  return {
    country: "CL",
    sandbox: connection?.sandbox !== false,
    portalUrl: buildDtePortalUrl(),
    facturaElectronicaUrl: buildDteFacturaElectronicaUrl(),
    requiredArtifacts,
    presentArtifacts,
    missingArtifacts,
    onboardingReady,
    signingReady,
    transmissionReady,
    liveSubmissionReady,
    liveSubmissionBlockedReason,
    nextActions,
    notes: [
      "Chile DTE often relies on signed XML and SII-specific validation paths.",
      "Live SII submission can run when the workspace has a submission URL configured.",
      "Status sync remains optional and may require a separate polling endpoint.",
      "Cancellation can run when the workspace has a dedicated cancellation endpoint.",
    ],
  };
}

export function buildDteSigningPreparation(connection?: EInvoiceConnectionConfig | null) {
  return buildDteTransmissionPreparation(connection);
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

export async function submitDteDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  payload: EInvoicePayloadBuildResult;
}): Promise<EInvoiceSubmissionResult> {
  const credentials = getDteCredentials(input.connection);
  if (!credentials.submissionUrl) {
    throw new Error("DTE live submission requires a submission URL.");
  }

  const response = await fetch(credentials.submissionUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "CL_DTE",
      rut: credentials.rut,
      externalId: input.payload.externalId,
      format: input.payload.format,
      payload: input.payload.payload,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `DTE submission failed with status ${response.status}.`);
  }

  const submissionId =
    trim(parsed?.submissionId || parsed?.trackId || parsed?.folio || input.payload.externalId) || input.payload.externalId;
  const providerReference =
    trim(parsed?.providerReference || parsed?.trackId || parsed?.folio || submissionId) || submissionId;

  return {
    status: normalizeSubmissionStatus(parsed?.status),
    submissionId,
    providerReference,
    rawResponse: parsed,
  };
}

export async function getDteSubmissionStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceStatusResult> {
  const credentials = getDteCredentials(input.connection);
  if (!credentials.statusUrl) {
    return {
      status: "SUBMITTED",
      providerReference: input.submissionId,
      rawResponse: null,
      errorMessage: "DTE status sync endpoint is not configured for this workspace.",
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
    throw new Error(trim(parsed?.message || parsed?.error) || `DTE status lookup failed with status ${response.status}.`);
  }

  return {
    status: normalizeStatusResult(parsed?.status),
    providerReference:
      trim(parsed?.providerReference || parsed?.trackId || parsed?.folio || input.submissionId) || input.submissionId,
    rawResponse: parsed,
    errorMessage: trim(parsed?.errorMessage || parsed?.message) || null,
  };
}

export async function cancelDteDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceCancellationResult> {
  const credentials = getDteCredentials(input.connection);
  if (!credentials.cancelUrl) {
    throw new Error("DTE cancellation requires a cancellation URL.");
  }

  const response = await fetch(credentials.cancelUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "CL_DTE",
      rut: credentials.rut,
      submissionId: input.submissionId,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `DTE cancellation failed with status ${response.status}.`);
  }

  return {
    status: "CANCELLED",
    rawResponse: parsed,
  };
}
