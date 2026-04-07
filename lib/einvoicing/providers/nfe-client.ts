import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoicePayloadBuildResult,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "@/lib/einvoicing/types";

const NFE_PORTAL_URL = "https://www.nfe.fazenda.gov.br";
const NFE_PORTAL_GUIDE_URL = "https://www.nfe.fazenda.gov.br/portal";
const NFE_SEFAZ_BASE_URL = "https://www.nfe.fazenda.gov.br/portal/consulta.aspx";

type NfeCredentials = {
  cnpj: string;
  certificatePem?: string;
  privateKeyPem?: string;
  certificatePassword?: string;
  uf?: string;
  submissionUrl?: string;
  statusUrl?: string;
  cancelUrl?: string;
};

type NfeTransmissionPreparation = {
  country: "BR";
  sandbox: boolean;
  portalUrl: string;
  guideUrl: string;
  consultaUrl: string;
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
const normalizeUf = (value: unknown) => trim(value).toUpperCase() || null;

function getConnectionCredentials(connection?: EInvoiceConnectionConfig | null) {
  return (connection?.credentials || {}) as Record<string, unknown>;
}

export function getNfeCredentials(connection?: EInvoiceConnectionConfig | null): NfeCredentials {
  const credentials = getConnectionCredentials(connection);
  const cnpj = trim(credentials.cnpj || credentials.taxId);
  if (!cnpj) {
    throw new Error("NF-e requires a CNPJ before endpoint preparation.");
  }

  return {
    cnpj,
    ...(trim(credentials.certificatePem) ? { certificatePem: trim(credentials.certificatePem) } : {}),
    ...(trim(credentials.privateKeyPem) ? { privateKeyPem: trim(credentials.privateKeyPem) } : {}),
    ...(trim(credentials.certificatePassword) ? { certificatePassword: trim(credentials.certificatePassword) } : {}),
    ...(normalizeUf(credentials.uf) ? { uf: normalizeUf(credentials.uf) as string } : {}),
    ...(trim(credentials.submissionUrl) ? { submissionUrl: trim(credentials.submissionUrl) } : {}),
    ...(trim(credentials.statusUrl) ? { statusUrl: trim(credentials.statusUrl) } : {}),
    ...(trim(credentials.cancelUrl) ? { cancelUrl: trim(credentials.cancelUrl) } : {}),
  };
}

export function buildNfePortalUrl() {
  return NFE_PORTAL_URL;
}

export function buildNfeGuideUrl() {
  return NFE_PORTAL_GUIDE_URL;
}

export function buildNfeConsultaUrl() {
  return NFE_SEFAZ_BASE_URL;
}

export function buildNfeTransmissionPreparation(connection?: EInvoiceConnectionConfig | null): NfeTransmissionPreparation {
  const credentials = getConnectionCredentials(connection);
  const cnpj = trim(credentials.cnpj || credentials.taxId);
  const certificatePem = trim(credentials.certificatePem);
  const privateKeyPem = trim(credentials.privateKeyPem);
  const certificatePassword = trim(credentials.certificatePassword);
  const uf = normalizeUf(credentials.uf);
  const submissionUrl = trim(credentials.submissionUrl);
  const statusUrl = trim(credentials.statusUrl);
  const cancelUrl = trim(credentials.cancelUrl);
  const requiredArtifacts = ["CNPJ", "certificate", "private key", "UF", "submission URL"];
  const presentArtifacts = [
    cnpj ? "CNPJ" : null,
    certificatePem ? "certificate" : null,
    privateKeyPem ? "private key" : null,
    certificatePassword ? "certificate password" : null,
    uf ? `UF:${uf}` : null,
    submissionUrl ? "submission URL" : null,
    statusUrl ? "status URL" : null,
    cancelUrl ? "cancellation URL" : null,
  ].filter(Boolean) as string[];
  const missingArtifacts = requiredArtifacts.filter((artifact) => {
    if (artifact === "CNPJ") return !cnpj;
    if (artifact === "certificate") return !certificatePem;
    if (artifact === "private key") return !privateKeyPem;
    if (artifact === "UF") return !uf;
    if (artifact === "submission URL") return !submissionUrl;
    return false;
  });

  const onboardingReady = Boolean(cnpj && uf);
  const signingReady = Boolean(cnpj && certificatePem && privateKeyPem);
  const transmissionReady = Boolean(onboardingReady && signingReady && submissionUrl);
  const liveSubmissionReady = transmissionReady;
  const liveSubmissionBlockedReason = liveSubmissionReady
    ? null
    : "Live NF-e submission requires CNPJ, UF, signing material, and a SEFAZ submission URL.";

  const nextActions: string[] = [];
  if (!cnpj) nextActions.push("Add the company CNPJ.");
  if (!uf) nextActions.push("Set the state UF for the issuing branch.");
  if (!certificatePem) nextActions.push("Upload the NF-e signing certificate.");
  if (!privateKeyPem) nextActions.push("Store the NF-e signing private key.");
  if (!certificatePassword) nextActions.push("Store the certificate password if your flow requires it.");
  if (!submissionUrl) nextActions.push("Add the SEFAZ or accredited NF-e submission URL.");
  if (!statusUrl) nextActions.push("Add a status URL if you want automatic NF-e polling.");
  if (!cancelUrl) nextActions.push("Add a cancellation URL if you want automated NF-e cancellation.");
  if (cnpj && uf && certificatePem && privateKeyPem && !certificatePassword) {
    nextActions.push("Confirm whether your SEFAZ environment requires certificate password handling.");
  }
  if (liveSubmissionBlockedReason) {
    nextActions.push(liveSubmissionBlockedReason);
  }

  return {
    country: "BR",
    sandbox: connection?.sandbox !== false,
    portalUrl: buildNfePortalUrl(),
    guideUrl: buildNfeGuideUrl(),
    consultaUrl: buildNfeConsultaUrl(),
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
      "Brazil NF-e typically requires signed XML and state-specific transmission details.",
      "Live SEFAZ submission can run when the workspace has a submission URL configured.",
      "Status sync remains optional and may require a separate endpoint per state or gateway.",
      "Cancellation can run when the workspace has a dedicated cancellation endpoint.",
    ],
  };
}

export function buildNfeSigningPreparation(connection?: EInvoiceConnectionConfig | null) {
  return buildNfeTransmissionPreparation(connection);
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
  if (normalized === "REJECTED" || normalized === "DENIED" || normalized === "FAILED" || normalized === "ERROR") {
    return "REJECTED";
  }
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "CANCELLED";
  if (normalized === "QUEUED" || normalized === "PENDING") return "QUEUED";
  return "SUBMITTED";
}

export async function submitNfeDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  payload: EInvoicePayloadBuildResult;
}): Promise<EInvoiceSubmissionResult> {
  const credentials = getNfeCredentials(input.connection);
  if (!credentials.submissionUrl) {
    throw new Error("NF-e live submission requires a submission URL.");
  }

  const response = await fetch(credentials.submissionUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "BR_NFE",
      cnpj: credentials.cnpj,
      uf: credentials.uf || null,
      externalId: input.payload.externalId,
      format: input.payload.format,
      payload: input.payload.payload,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `NF-e submission failed with status ${response.status}.`);
  }

  const submissionId =
    trim(parsed?.submissionId || parsed?.receiptNumber || parsed?.nRec || input.payload.externalId) ||
    input.payload.externalId;
  const providerReference =
    trim(parsed?.providerReference || parsed?.accessKey || parsed?.chaveAcesso || submissionId) || submissionId;

  return {
    status: normalizeSubmissionStatus(parsed?.status),
    submissionId,
    providerReference,
    rawResponse: parsed,
  };
}

export async function getNfeSubmissionStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceStatusResult> {
  const credentials = getNfeCredentials(input.connection);
  if (!credentials.statusUrl) {
    return {
      status: "SUBMITTED",
      providerReference: input.submissionId,
      rawResponse: null,
      errorMessage: "NF-e status sync endpoint is not configured for this workspace.",
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
    throw new Error(trim(parsed?.message || parsed?.error) || `NF-e status lookup failed with status ${response.status}.`);
  }

  return {
    status: normalizeStatusResult(parsed?.status),
    providerReference:
      trim(parsed?.providerReference || parsed?.accessKey || parsed?.chaveAcesso || input.submissionId) ||
      input.submissionId,
    rawResponse: parsed,
    errorMessage: trim(parsed?.errorMessage || parsed?.message) || null,
  };
}

export async function cancelNfeDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceCancellationResult> {
  const credentials = getNfeCredentials(input.connection);
  if (!credentials.cancelUrl) {
    throw new Error("NF-e cancellation requires a cancellation URL.");
  }

  const response = await fetch(credentials.cancelUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "BR_NFE",
      cnpj: credentials.cnpj,
      uf: credentials.uf || null,
      submissionId: input.submissionId,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `NF-e cancellation failed with status ${response.status}.`);
  }

  return {
    status: "CANCELLED",
    rawResponse: parsed,
  };
}
