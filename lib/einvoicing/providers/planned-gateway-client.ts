import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoicePayloadBuildResult,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "@/lib/einvoicing/types";

type PlannedGatewayCredentials = {
  companyTaxId: string;
  apiKey: string;
  submissionUrl: string;
  statusUrl?: string;
  cancelUrl?: string;
};

type PlannedGatewayPreparation = {
  country: string;
  sandbox: boolean;
  providerLabel: string;
  requiredArtifacts: string[];
  presentArtifacts: string[];
  missingArtifacts: string[];
  onboardingReady: boolean;
  authReady: boolean;
  transmissionReady: boolean;
  liveSubmissionReady: boolean;
  liveSubmissionBlockedReason: string | null;
  nextActions: string[];
  notes: string[];
};

const trim = (value: unknown) => String(value || "").trim();

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function pickMessage(payload: Record<string, unknown> | null) {
  return trim(
    payload?.message ||
      payload?.error ||
      payload?.errorMessage ||
      payload?.detail ||
      payload?.title
  );
}

function extractSubmissionId(payload: Record<string, unknown> | null) {
  return (
    trim(payload?.submissionId) ||
    trim(payload?.submissionUid) ||
    trim(payload?.documentId) ||
    trim(payload?.trackingId) ||
    trim(payload?.id)
  );
}

function extractProviderReference(payload: Record<string, unknown> | null) {
  return (
    trim(payload?.providerReference) ||
    trim(payload?.uuid) ||
    trim(payload?.reference) ||
    trim(payload?.longId) ||
    null
  );
}

function mapStatus(value: unknown): EInvoiceStatusResult["status"] {
  const normalized = trim(value).toUpperCase();
  if (normalized === "ACCEPTED" || normalized === "APPROVED" || normalized === "VALID") return "ACCEPTED";
  if (normalized === "REJECTED" || normalized === "DECLINED" || normalized === "INVALID") return "REJECTED";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "CANCELLED";
  if (normalized === "QUEUED" || normalized === "PENDING") return "QUEUED";
  return "SUBMITTED";
}

function mapSubmissionStatus(value: unknown): EInvoiceSubmissionResult["status"] {
  const normalized = trim(value).toUpperCase();
  if (normalized === "ACCEPTED" || normalized === "APPROVED" || normalized === "VALID") return "ACCEPTED";
  if (normalized === "QUEUED" || normalized === "PENDING") return "QUEUED";
  return "SUBMITTED";
}

function buildHeaders(credentials: PlannedGatewayCredentials) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-API-Key": credentials.apiKey,
  };
}

export function getPlannedGatewayCredentials(
  connection: EInvoiceConnectionConfig | null | undefined,
  providerLabel: string
): PlannedGatewayCredentials {
  const credentials = (connection?.credentials || {}) as Record<string, unknown>;
  const companyTaxId = trim(credentials.companyTaxId || credentials.taxId);
  const apiKey = trim(credentials.apiKey);
  const submissionUrl = trim(credentials.submissionUrl);
  const statusUrl = trim(credentials.statusUrl);
  const cancelUrl = trim(credentials.cancelUrl);

  if (!companyTaxId || !apiKey || !submissionUrl) {
    throw new Error(`${providerLabel} requires a company tax ID, API key, and submission URL before live submission.`);
  }

  return {
    companyTaxId,
    apiKey,
    submissionUrl,
    ...(statusUrl ? { statusUrl } : {}),
    ...(cancelUrl ? { cancelUrl } : {}),
  };
}

export function buildPlannedGatewayPreparation(input: {
  connection?: EInvoiceConnectionConfig | null;
  country: string;
  providerLabel: string;
}): PlannedGatewayPreparation {
  const rawCredentials = (input.connection?.credentials || {}) as Record<string, unknown>;
  const companyTaxId = trim(rawCredentials.companyTaxId || rawCredentials.taxId);
  const apiKey = trim(rawCredentials.apiKey);
  const submissionUrl = trim(rawCredentials.submissionUrl);
  const statusUrl = trim(rawCredentials.statusUrl);
  const cancelUrl = trim(rawCredentials.cancelUrl);

  const requiredArtifacts = ["company tax ID", "API key", "submission URL"];
  const presentArtifacts = [
    companyTaxId ? "company tax ID" : null,
    apiKey ? "API key" : null,
    submissionUrl ? "submission URL" : null,
    statusUrl ? "status URL" : null,
    cancelUrl ? "cancellation URL" : null,
  ].filter(Boolean) as string[];
  const missingArtifacts = requiredArtifacts.filter((artifact) => {
    if (artifact === "company tax ID") return !companyTaxId;
    if (artifact === "API key") return !apiKey;
    if (artifact === "submission URL") return !submissionUrl;
    return false;
  });

  const onboardingReady = Boolean(companyTaxId);
  const authReady = Boolean(apiKey);
  const transmissionReady = Boolean(onboardingReady && authReady && submissionUrl);
  const liveSubmissionReady = transmissionReady;

  return {
    country: input.country,
    sandbox: input.connection?.sandbox !== false,
    providerLabel: input.providerLabel,
    requiredArtifacts,
    presentArtifacts,
    missingArtifacts,
    onboardingReady,
    authReady,
    transmissionReady,
    liveSubmissionReady,
    liveSubmissionBlockedReason: liveSubmissionReady
      ? null
      : `${input.providerLabel} live submission requires a company tax ID, API key, and submission URL.`,
    nextActions: [
      !companyTaxId ? "Store the company tax identifier used by the accredited gateway." : null,
      !apiKey ? "Store the API key issued by the accredited gateway or compliance partner." : null,
      !submissionUrl ? "Configure the accredited gateway submission URL." : null,
      !statusUrl ? "Configure a status URL if you want automatic submission polling." : null,
      !cancelUrl ? "Configure a cancellation URL if you want automated withdrawal handling." : null,
    ].filter(Boolean) as string[],
    notes: [
      `${input.providerLabel} uses a workspace-configured accredited gateway endpoint rather than a hard-coded government endpoint.`,
      "Country-specific legal certification and production signoff still need to be completed before launch.",
    ],
  };
}

export async function submitPlannedGatewayDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  payload: EInvoicePayloadBuildResult;
  providerKey: string;
  providerLabel: string;
}): Promise<EInvoiceSubmissionResult> {
  const credentials = getPlannedGatewayCredentials(input.connection, input.providerLabel);
  const response = await fetch(credentials.submissionUrl, {
    method: "POST",
    headers: buildHeaders(credentials),
    body: JSON.stringify({
      provider: input.providerKey,
      companyTaxId: credentials.companyTaxId,
      externalId: input.payload.externalId,
      format: input.payload.format,
      document: input.payload.payload,
    }),
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(
      pickMessage(payload) || `${input.providerLabel} submission failed with status ${response.status}.`
    );
  }

  const submissionId = extractSubmissionId(payload);
  if (!submissionId) {
    throw new Error(`${input.providerLabel} submission response did not include a submission ID.`);
  }

  return {
    status: mapSubmissionStatus(payload?.status),
    submissionId,
    providerReference: extractProviderReference(payload),
    rawResponse: payload,
  };
}

export async function getPlannedGatewaySubmissionStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
  providerLabel: string;
}): Promise<EInvoiceStatusResult> {
  const credentials = getPlannedGatewayCredentials(input.connection, input.providerLabel);
  if (!credentials.statusUrl) {
    throw new Error(`${input.providerLabel} status sync requires a status URL.`);
  }

  const response = await fetch(
    `${credentials.statusUrl}?submissionId=${encodeURIComponent(input.submissionId)}`,
    {
      method: "GET",
      headers: buildHeaders(credentials),
    }
  );
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(
      pickMessage(payload) || `${input.providerLabel} status lookup failed with status ${response.status}.`
    );
  }

  return {
    status: mapStatus(payload?.status),
    providerReference: extractProviderReference(payload),
    rawResponse: payload,
    errorMessage: mapStatus(payload?.status) === "REJECTED" ? pickMessage(payload) || null : null,
  };
}

export async function cancelPlannedGatewayDocument(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
  providerLabel: string;
}): Promise<EInvoiceCancellationResult> {
  const credentials = getPlannedGatewayCredentials(input.connection, input.providerLabel);
  if (!credentials.cancelUrl) {
    throw new Error(`${input.providerLabel} cancellation requires a cancellation URL.`);
  }

  const response = await fetch(credentials.cancelUrl, {
    method: "POST",
    headers: buildHeaders(credentials),
    body: JSON.stringify({
      companyTaxId: credentials.companyTaxId,
      submissionId: input.submissionId,
    }),
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(
      pickMessage(payload) || `${input.providerLabel} cancellation failed with status ${response.status}.`
    );
  }

  return {
    status: "CANCELLED",
    rawResponse: payload,
  };
}
