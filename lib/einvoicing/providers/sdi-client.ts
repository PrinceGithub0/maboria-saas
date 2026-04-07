
import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoicePayloadBuildResult,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "@/lib/einvoicing/types";

const SDI_PORTAL_URL = "https://www.fatturapa.gov.it";
const SDI_GUIDES_URL = "https://www.fatturapa.gov.it/it/fatturazione-elettronica/";
const SDI_ACCCREDITAMENTO_URL = "https://www.fatturapa.gov.it/export/fatturazione/it/sdi/accreditare_canale.htm";

type SdiCredentials = {
  vatNumber: string;
  transmissionId?: string;
  recipientCode?: string;
  pecEmail?: string;
  certificatePem?: string;
  privateKeyPem?: string;
  submissionUrl?: string;
  statusUrl?: string;
  cancelUrl?: string;
};

type SdiCredentialSnapshot = {
  vatNumber: string | null;
  transmissionId: string | null;
  recipientCode: string | null;
  pecEmail: string | null;
  certificatePem: string | null;
  privateKeyPem: string | null;
  submissionUrl: string | null;
  statusUrl: string | null;
  cancelUrl: string | null;
};

export type SdiTransmissionPreparation = {
  country: "IT";
  sandbox: boolean;
  portalUrl: string;
  guidesUrl: string;
  accreditationUrl: string;
  requiredArtifacts: string[];
  presentArtifacts: string[];
  missingArtifacts: string[];
  onboardingReady: boolean;
  transmissionReady: boolean;
  productionReady: boolean;
  liveSubmissionReady: boolean;
  liveSubmissionBlockedReason: string;
  nextActions: string[];
  notes: string[];
};

const trim = (value: unknown) => String(value || "").trim();

export function getSdiCredentials(connection?: EInvoiceConnectionConfig | null): SdiCredentials {
  const credentials = (connection?.credentials || {}) as Record<string, unknown>;
  const vatNumber = trim(credentials.vatNumber || credentials.taxId);

  if (!vatNumber) {
    throw new Error("SdI requires a VAT number before endpoint preparation.");
  }

  return {
    vatNumber,
    ...(trim(credentials.transmissionId) ? { transmissionId: trim(credentials.transmissionId) } : {}),
    ...(trim(credentials.recipientCode) ? { recipientCode: trim(credentials.recipientCode) } : {}),
    ...(trim(credentials.pecEmail) ? { pecEmail: trim(credentials.pecEmail) } : {}),
    ...(trim(credentials.certificatePem) ? { certificatePem: trim(credentials.certificatePem) } : {}),
    ...(trim(credentials.privateKeyPem) ? { privateKeyPem: trim(credentials.privateKeyPem) } : {}),
    ...(trim(credentials.submissionUrl) ? { submissionUrl: trim(credentials.submissionUrl) } : {}),
    ...(trim(credentials.statusUrl) ? { statusUrl: trim(credentials.statusUrl) } : {}),
    ...(trim(credentials.cancelUrl) ? { cancelUrl: trim(credentials.cancelUrl) } : {}),
  };
}

function readSdiCredentialSnapshot(connection?: EInvoiceConnectionConfig | null): SdiCredentialSnapshot {
  const credentials = (connection?.credentials || {}) as Record<string, unknown>;
  return {
    vatNumber: trim(credentials.vatNumber || credentials.taxId) || null,
    transmissionId: trim(credentials.transmissionId) || null,
    recipientCode: trim(credentials.recipientCode) || null,
    pecEmail: trim(credentials.pecEmail) || null,
    certificatePem: trim(credentials.certificatePem) || null,
    privateKeyPem: trim(credentials.privateKeyPem) || null,
    submissionUrl: trim(credentials.submissionUrl) || null,
    statusUrl: trim(credentials.statusUrl) || null,
    cancelUrl: trim(credentials.cancelUrl) || null,
  };
}

export function buildSdiPortalUrl() {
  return SDI_PORTAL_URL;
}

export function buildSdiGuidesUrl() {
  return SDI_GUIDES_URL;
}

export function buildSdiAccreditationUrl() {
  return SDI_ACCCREDITAMENTO_URL;
}

export function buildSdiTransmissionPreparation(connection?: EInvoiceConnectionConfig | null) {
  const credentials = readSdiCredentialSnapshot(connection);
  const requiredArtifacts = ["VAT number", "Transmission ID", "Recipient code or PEC email", "Certificate", "Private key", "Submission URL"];
  const missingArtifacts = [
    !credentials.vatNumber ? "VAT number" : null,
    !credentials.transmissionId ? "Transmission ID" : null,
    !credentials.recipientCode && !credentials.pecEmail ? "Recipient code or PEC email" : null,
    !credentials.certificatePem ? "Certificate" : null,
    !credentials.privateKeyPem ? "Private key" : null,
    !credentials.submissionUrl ? "Submission URL" : null,
  ].filter(Boolean) as string[];
  const onboardingReady = Boolean(credentials.vatNumber);
  const transmissionReady = onboardingReady && missingArtifacts.length === 0;
  const productionReady =
    transmissionReady &&
    connection?.sandbox === false &&
    Boolean(credentials.statusUrl) &&
    Boolean(credentials.cancelUrl);
  const liveSubmissionReady = transmissionReady;
  const liveSubmissionBlockedReason = liveSubmissionReady
    ? null
    : "Live SdI submission requires VAT number, routing data, signing material, and a submission URL.";

  return {
    country: "IT" as const,
    sandbox: connection?.sandbox !== false,
    portalUrl: buildSdiPortalUrl(),
    guidesUrl: buildSdiGuidesUrl(),
    accreditationUrl: buildSdiAccreditationUrl(),
    requiredArtifacts,
    presentArtifacts: [
      credentials.vatNumber ? `VAT number (${credentials.vatNumber})` : null,
      credentials.transmissionId ? "transmission ID" : null,
      credentials.recipientCode ? "recipient code" : null,
      credentials.pecEmail ? "PEC email" : null,
      credentials.certificatePem ? "certificate" : null,
      credentials.privateKeyPem ? "private key" : null,
      credentials.submissionUrl ? "submission URL" : null,
      credentials.statusUrl ? "status URL" : null,
      credentials.cancelUrl ? "cancellation URL" : null,
    ].filter(Boolean) as string[],
    missingArtifacts,
    onboardingReady,
    transmissionReady,
    productionReady,
    liveSubmissionReady,
    liveSubmissionBlockedReason,
    nextActions: [
      !credentials.vatNumber ? "Add the seller VAT number before SdI preparation." : null,
      !credentials.transmissionId ? "Add the transmission ID used for the accredited channel." : null,
      !credentials.recipientCode && !credentials.pecEmail ? "Add a recipient code or PEC email for routing." : null,
      !credentials.certificatePem ? "Add the signing certificate material." : null,
      !credentials.privateKeyPem ? "Add the private key used for signing." : null,
      !credentials.submissionUrl ? "Add the accredited submission URL or gateway endpoint." : null,
      !credentials.statusUrl ? "Add a status URL if you want automatic SdI polling." : null,
      !credentials.cancelUrl ? "Add a cancellation URL if you want automated SdI cancellation support." : null,
    ].filter(Boolean) as string[],
    notes: [
      "Italy SdI usually requires FatturaPA-compatible XML and accredited transmission channels.",
      "Live transmission can run when the workspace has an accredited submission URL or gateway endpoint.",
      "Status sync remains optional and may require a separate status endpoint.",
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

function normalizeSdiSubmissionStatus(value: unknown): EInvoiceSubmissionResult["status"] {
  const normalized = trim(value).toUpperCase();
  if (normalized === "ACCEPTED" || normalized === "DELIVERED" || normalized === "SUCCESS") return "ACCEPTED";
  if (normalized === "QUEUED" || normalized === "PENDING") return "QUEUED";
  return "SUBMITTED";
}

function normalizeSdiStatus(value: unknown): EInvoiceStatusResult["status"] {
  const normalized = trim(value).toUpperCase();
  if (normalized === "ACCEPTED" || normalized === "DELIVERED" || normalized === "SUCCESS") return "ACCEPTED";
  if (normalized === "REJECTED" || normalized === "FAILED" || normalized === "ERROR") return "REJECTED";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "CANCELLED";
  if (normalized === "QUEUED" || normalized === "PENDING") return "QUEUED";
  return "SUBMITTED";
}

export async function submitSdiDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  payload: EInvoicePayloadBuildResult;
}): Promise<EInvoiceSubmissionResult> {
  const credentials = getSdiCredentials(input.connection);
  if (!credentials.submissionUrl) {
    throw new Error("SdI live submission requires a submission URL.");
  }

  const response = await fetch(credentials.submissionUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "IT_SDI",
      vatNumber: credentials.vatNumber,
      transmissionId: credentials.transmissionId || null,
      recipientCode: credentials.recipientCode || null,
      pecEmail: credentials.pecEmail || null,
      externalId: input.payload.externalId,
      format: input.payload.format,
      payload: input.payload.payload,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `SdI submission failed with status ${response.status}.`);
  }

  const submissionId =
    trim(parsed?.submissionId || parsed?.transmissionId || parsed?.identifier || input.payload.externalId) ||
    input.payload.externalId;
  const providerReference = trim(parsed?.providerReference || parsed?.receiptId || submissionId) || submissionId;

  return {
    status: normalizeSdiSubmissionStatus(parsed?.status),
    submissionId,
    providerReference,
    rawResponse: parsed,
  };
}

export async function getSdiSubmissionStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceStatusResult> {
  const credentials = getSdiCredentials(input.connection);
  if (!credentials.statusUrl) {
    return {
      status: "SUBMITTED",
      providerReference: input.submissionId,
      rawResponse: null,
      errorMessage: "SdI status sync endpoint is not configured for this workspace.",
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
    throw new Error(trim(parsed?.message || parsed?.error) || `SdI status lookup failed with status ${response.status}.`);
  }

  return {
    status: normalizeSdiStatus(parsed?.status),
    providerReference: trim(parsed?.providerReference || parsed?.receiptId || input.submissionId) || input.submissionId,
    rawResponse: parsed,
    errorMessage: trim(parsed?.errorMessage || parsed?.message) || null,
  };
}

export async function cancelSdiDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceCancellationResult> {
  const credentials = getSdiCredentials(input.connection);
  if (!credentials.cancelUrl) {
    throw new Error("SdI cancellation requires a cancellation URL.");
  }

  const response = await fetch(credentials.cancelUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "IT_SDI",
      vatNumber: credentials.vatNumber,
      submissionId: input.submissionId,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    throw new Error(trim(parsed?.message || parsed?.error) || `SdI cancellation failed with status ${response.status}.`);
  }

  return {
    status: "CANCELLED",
    rawResponse: parsed,
  };
}
