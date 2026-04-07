import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoicePayloadBuildResult,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "@/lib/einvoicing/types";

const DIAN_PORTAL_URL = "https://www.dian.gov.co";
const DIAN_FACTURACION_URL = "https://www.dian.gov.co/impuestos/factura-electronica";

type DianCredentials = {
  nit: string;
  softwareId?: string;
  softwarePin?: string;
  certificatePem?: string;
  privateKeyPem?: string;
  submissionUrl?: string;
  statusUrl?: string;
  cancelUrl?: string;
};

const trim = (value: unknown) => String(value || "").trim();

export function getDianCredentials(connection?: EInvoiceConnectionConfig | null): DianCredentials {
  const credentials = (connection?.credentials || {}) as Record<string, unknown>;
  const nit = trim(credentials.nit || credentials.taxId);
  if (!nit) {
    throw new Error("DIAN requires a NIT before endpoint preparation.");
  }

  return {
    nit,
    ...(trim(credentials.softwareId) ? { softwareId: trim(credentials.softwareId) } : {}),
    ...(trim(credentials.softwarePin) ? { softwarePin: trim(credentials.softwarePin) } : {}),
    ...(trim(credentials.certificatePem) ? { certificatePem: trim(credentials.certificatePem) } : {}),
    ...(trim(credentials.privateKeyPem) ? { privateKeyPem: trim(credentials.privateKeyPem) } : {}),
    ...(trim(credentials.submissionUrl) ? { submissionUrl: trim(credentials.submissionUrl) } : {}),
    ...(trim(credentials.statusUrl) ? { statusUrl: trim(credentials.statusUrl) } : {}),
    ...(trim(credentials.cancelUrl) ? { cancelUrl: trim(credentials.cancelUrl) } : {}),
  };
}

export function buildDianPortalUrl() {
  return DIAN_PORTAL_URL;
}

export function buildDianFacturacionUrl() {
  return DIAN_FACTURACION_URL;
}

export function buildDianOnboardingPreparation(connection?: EInvoiceConnectionConfig | null) {
  const credentials = getDianCredentials(connection);
  const presentArtifacts = [
    "NIT",
    credentials.softwareId ? "software ID" : null,
    credentials.softwarePin ? "software PIN" : null,
    credentials.certificatePem ? "certificate" : null,
    credentials.privateKeyPem ? "private key" : null,
    credentials.submissionUrl ? "submission URL" : null,
    credentials.statusUrl ? "status URL" : null,
    credentials.cancelUrl ? "cancellation URL" : null,
  ].filter(Boolean) as string[];
  const requiredArtifacts = ["NIT"];
  const onboardingReady = true;
  const signingReady = Boolean(credentials.certificatePem && credentials.privateKeyPem);
  const transmissionReady = Boolean(credentials.softwareId && credentials.softwarePin && signingReady && credentials.submissionUrl);
  const liveSubmissionReady = transmissionReady;
  const liveSubmissionBlockedReason = liveSubmissionReady
    ? null
    : "Live DIAN submission requires software credentials, signing material, and a submission URL.";
  const missingArtifacts = [
    !credentials.softwareId ? "software ID" : null,
    !credentials.softwarePin ? "software PIN" : null,
    !credentials.certificatePem ? "certificate" : null,
    !credentials.privateKeyPem ? "private key" : null,
    !credentials.submissionUrl ? "submission URL" : null,
  ].filter(Boolean) as string[];

  return {
    country: "CO" as const,
    sandbox: connection?.sandbox !== false,
    portalUrl: buildDianPortalUrl(),
    facturacionUrl: buildDianFacturacionUrl(),
    requiredArtifacts,
    presentArtifacts,
    onboardingReady,
    signingReady,
    transmissionReady,
    liveSubmissionReady,
    liveSubmissionBlockedReason,
    missingArtifacts,
    nextActions: [
      !credentials.softwareId ? "Add the DIAN software ID for authorized submission." : null,
      !credentials.softwarePin ? "Add the DIAN software PIN for authorized submission." : null,
      !credentials.certificatePem ? "Attach the DIAN certificate used for signed XML." : null,
      !credentials.privateKeyPem ? "Attach the DIAN private key used for signed XML." : null,
      !credentials.submissionUrl ? "Add the DIAN or technology-provider submission URL." : null,
      !credentials.statusUrl ? "Add a status URL if you want automatic DIAN polling." : null,
      !credentials.cancelUrl ? "Add a cancellation URL if you want automated DIAN cancellation." : null,
      liveSubmissionBlockedReason,
    ].filter(Boolean) as string[],
    notes: [
      "Colombia DIAN typically requires software authorization and signed electronic documents.",
      "Live DIAN submission can run when the workspace has a submission URL configured.",
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

export async function submitDianDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  payload: EInvoicePayloadBuildResult;
}): Promise<EInvoiceSubmissionResult> {
  const credentials = getDianCredentials(input.connection);
  if (!credentials.submissionUrl) {
    throw new Error("DIAN live submission requires a submission URL.");
  }

  const response = await fetch(credentials.submissionUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "CO_DIAN",
      nit: credentials.nit,
      softwareId: credentials.softwareId || null,
      externalId: input.payload.externalId,
      format: input.payload.format,
      payload: input.payload.payload,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `DIAN submission failed with status ${response.status}.`);
  }

  const submissionId =
    trim(parsed?.submissionId || parsed?.trackId || parsed?.cufe || input.payload.externalId) || input.payload.externalId;
  const providerReference =
    trim(parsed?.providerReference || parsed?.cufe || parsed?.trackId || submissionId) || submissionId;

  return {
    status: normalizeSubmissionStatus(parsed?.status),
    submissionId,
    providerReference,
    rawResponse: parsed,
  };
}

export async function getDianSubmissionStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceStatusResult> {
  const credentials = getDianCredentials(input.connection);
  if (!credentials.statusUrl) {
    return {
      status: "SUBMITTED",
      providerReference: input.submissionId,
      rawResponse: null,
      errorMessage: "DIAN status sync endpoint is not configured for this workspace.",
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
    throw new Error(trim(parsed?.message || parsed?.error) || `DIAN status lookup failed with status ${response.status}.`);
  }

  return {
    status: normalizeStatusResult(parsed?.status),
    providerReference:
      trim(parsed?.providerReference || parsed?.cufe || parsed?.trackId || input.submissionId) || input.submissionId,
    rawResponse: parsed,
    errorMessage: trim(parsed?.errorMessage || parsed?.message) || null,
  };
}

export async function cancelDianDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceCancellationResult> {
  const credentials = getDianCredentials(input.connection);
  if (!credentials.cancelUrl) {
    throw new Error("DIAN cancellation requires a cancellation URL.");
  }

  const response = await fetch(credentials.cancelUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "CO_DIAN",
      nit: credentials.nit,
      softwareId: credentials.softwareId || null,
      submissionId: input.submissionId,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `DIAN cancellation failed with status ${response.status}.`);
  }

  return {
    status: "CANCELLED",
    rawResponse: parsed,
  };
}
