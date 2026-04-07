import type {
  EInvoiceCancellationResult,
  EInvoiceConnectionConfig,
  EInvoicePayloadBuildResult,
  EInvoiceStatusResult,
  EInvoiceSubmissionResult,
} from "@/lib/einvoicing/types";

const ZATCA_BASE_URL = "https://zatca.gov.sa";
const ZATCA_FATOORA_PORTAL_URL = "https://fatoora.zatca.gov.sa";
const ZATCA_SANDBOX_URL = "https://sandbox.zatca.gov.sa";
const ZATCA_INTEGRATION_SANDBOX_URL = "https://sandbox.zatca.gov.sa/IntegrationSandbox";
const ZATCA_COMPLIANCE_SANDBOX_URL = "https://sandbox.zatca.gov.sa/Compliance";

type ZatcaCredentials = {
  tin: string;
  portalUsername?: string;
  portalPassword?: string;
  otp?: string;
  csr?: string;
  csid?: string;
  privateKeyPem?: string;
  certificatePem?: string;
  binarySecurityToken?: string;
  binarySecurityTokenSecret?: string;
  complianceRequestId?: string;
  egsSerialNumber?: string;
  statusUrl?: string;
  cancelUrl?: string;
};

type ZatcaCredentialSnapshot = {
  tin: string | null;
  portalUsername: string | null;
  portalPassword: string | null;
  otp: string | null;
  csr: string | null;
  csid: string | null;
  privateKeyPem: string | null;
  certificatePem: string | null;
  binarySecurityToken: string | null;
  binarySecurityTokenSecret: string | null;
  complianceRequestId: string | null;
  egsSerialNumber: string | null;
  statusUrl: string | null;
  cancelUrl: string | null;
};

type ZatcaTransportPreparation = {
  country: "SA";
  sandbox: boolean;
  portalUrl: string;
  developerPortalUrl: string;
  onboardingUrl: string;
  integrationSandboxUrl: string;
  complianceSandboxUrl: string;
  productionAccessRequirement: string;
  requiredArtifacts: string[];
  presentArtifacts: string[];
  missingArtifacts: string[];
  onboardingReady: boolean;
  clearanceReady: boolean;
  operationalReady: boolean;
  liveSubmissionReady: boolean;
  liveSubmissionBlockedReason: string | null;
  nextActions: string[];
  notes: string[];
};

const trim = (value: unknown) => String(value || "").trim();

function readCredentials(connection?: EInvoiceConnectionConfig | null): ZatcaCredentialSnapshot {
  const credentials = (connection?.credentials || {}) as Record<string, unknown>;
  return {
    tin: trim(credentials.tin) || null,
    portalUsername: trim(credentials.portalUsername) || null,
    portalPassword: trim(credentials.portalPassword) || null,
    otp: trim(credentials.otp) || null,
    csr: trim(credentials.csr) || null,
    csid: trim(credentials.csid) || null,
    privateKeyPem: trim(credentials.privateKeyPem) || null,
    certificatePem: trim(credentials.certificatePem) || null,
    binarySecurityToken: trim(credentials.binarySecurityToken) || null,
    binarySecurityTokenSecret: trim(credentials.binarySecurityTokenSecret || credentials.secret) || null,
    complianceRequestId: trim(credentials.complianceRequestId) || null,
    egsSerialNumber: trim(credentials.egsSerialNumber) || null,
    statusUrl: trim(credentials.statusUrl) || null,
    cancelUrl: trim(credentials.cancelUrl) || null,
  };
}

function normalizeCredentials(connection?: EInvoiceConnectionConfig | null): ZatcaCredentials {
  const credentials = readCredentials(connection);
  if (!credentials.tin) {
    throw new Error("ZATCA requires a TIN before onboarding or signing preparation.");
  }

  return {
    tin: credentials.tin,
    ...(credentials.portalUsername ? { portalUsername: credentials.portalUsername } : {}),
    ...(credentials.portalPassword ? { portalPassword: credentials.portalPassword } : {}),
    ...(credentials.otp ? { otp: credentials.otp } : {}),
    ...(credentials.csr ? { csr: credentials.csr } : {}),
    ...(credentials.csid ? { csid: credentials.csid } : {}),
    ...(credentials.privateKeyPem ? { privateKeyPem: credentials.privateKeyPem } : {}),
    ...(credentials.certificatePem ? { certificatePem: credentials.certificatePem } : {}),
    ...(credentials.binarySecurityToken ? { binarySecurityToken: credentials.binarySecurityToken } : {}),
    ...(credentials.binarySecurityTokenSecret
      ? { binarySecurityTokenSecret: credentials.binarySecurityTokenSecret }
      : {}),
    ...(credentials.complianceRequestId ? { complianceRequestId: credentials.complianceRequestId } : {}),
    ...(credentials.egsSerialNumber ? { egsSerialNumber: credentials.egsSerialNumber } : {}),
    ...(credentials.statusUrl ? { statusUrl: credentials.statusUrl } : {}),
    ...(credentials.cancelUrl ? { cancelUrl: credentials.cancelUrl } : {}),
  };
}

function buildArtifactState(connection?: EInvoiceConnectionConfig | null) {
  const credentials = readCredentials(connection);
  const requiredArtifacts = [
    "TIN",
    "ERAD portal access",
    "OTP",
    "CSR",
    "CSID",
    "private key",
    "certificate",
    "binary security token",
  ];
  const presentArtifacts = [
    credentials.tin ? "TIN" : null,
    credentials.portalUsername ? "ERAD portal username" : null,
    credentials.portalPassword ? "ERAD portal password" : null,
    credentials.otp ? "OTP" : null,
    credentials.csr ? "CSR" : null,
    credentials.csid ? "CSID" : null,
    credentials.privateKeyPem ? "private key" : null,
    credentials.certificatePem ? "certificate" : null,
    credentials.binarySecurityToken ? "binary security token" : null,
    credentials.complianceRequestId ? "compliance request ID" : null,
    credentials.egsSerialNumber ? "EGS serial number" : null,
    credentials.statusUrl ? "status URL" : null,
    credentials.cancelUrl ? "cancellation URL" : null,
  ].filter(Boolean) as string[];
  const missingArtifacts = requiredArtifacts.filter((item) => {
    if (item === "ERAD portal access") {
      return !(credentials.portalUsername && credentials.portalPassword);
    }
    if (item === "OTP") return !credentials.otp;
    if (item === "CSR") return !credentials.csr;
    if (item === "CSID") return !credentials.csid;
    if (item === "private key") return !credentials.privateKeyPem;
    if (item === "certificate") return !credentials.certificatePem;
    if (item === "binary security token") return !credentials.binarySecurityToken;
    return false;
  });
  const onboardingReady = !missingArtifacts.some((item) =>
    ["TIN", "ERAD portal access", "OTP", "CSR"].includes(item)
  );
  const clearanceReady = onboardingReady && !missingArtifacts.some((item) =>
    ["CSID", "private key", "certificate", "binary security token"].includes(item)
  );
  const operationalReady = clearanceReady && Boolean(credentials.complianceRequestId) && Boolean(credentials.egsSerialNumber);
  const liveSubmissionReady =
    clearanceReady &&
    operationalReady &&
    Boolean(credentials.binarySecurityTokenSecret);
  const liveSubmissionBlockedReason = liveSubmissionReady
    ? null
    : "Live ZATCA submission requires onboarding, signing artifacts, operational identifiers, and a binary security token secret.";

  const nextActions: string[] = [];
  if (!credentials.tin) {
    nextActions.push("Add the taxpayer TIN before onboarding ZATCA.");
  }
  if (!(credentials.portalUsername && credentials.portalPassword)) {
    nextActions.push("Store ERAD portal username and password for ZATCA onboarding.");
  }
  if (!credentials.otp) {
    nextActions.push("Add the OTP used for ZATCA onboarding.");
  }
  if (!credentials.csr) {
    nextActions.push("Generate and store the CSR.");
  }
  if (!credentials.csid) {
    nextActions.push("Store the CSID after onboarding.");
  }
  if (!credentials.privateKeyPem) {
    nextActions.push("Store the private key used for signing.");
  }
  if (!credentials.certificatePem) {
    nextActions.push("Store the certificate used for signing.");
  }
  if (!credentials.binarySecurityToken) {
    nextActions.push("Store the binary security token issued by ZATCA.");
  }
  if (!credentials.complianceRequestId) {
    nextActions.push("Store the compliance request ID to track onboarding state.");
  }
  if (!credentials.egsSerialNumber) {
    nextActions.push("Store the EGS serial number for the solution instance.");
  }
  if (!credentials.binarySecurityTokenSecret) {
    nextActions.push("Store the binary security token secret issued for the ZATCA solution.");
  }
  if (!credentials.statusUrl) {
    nextActions.push("Store a status lookup URL if you want automated ZATCA polling.");
  }
  if (!credentials.cancelUrl) {
    nextActions.push("Store a cancellation URL if you want automated ZATCA cancellation.");
  }
  if (!liveSubmissionReady) {
    nextActions.push("Complete all ZATCA onboarding and signing artifacts before live submission.");
  }

  return {
    credentials,
    requiredArtifacts,
    presentArtifacts,
    missingArtifacts,
    onboardingReady,
    clearanceReady,
    operationalReady,
    liveSubmissionReady,
    liveSubmissionBlockedReason,
    nextActions,
  };
}

export function getZatcaCredentials(connection?: EInvoiceConnectionConfig | null) {
  return normalizeCredentials(connection);
}

export function buildZatcaDeveloperPortalUrl() {
  return `${ZATCA_BASE_URL}/en/E-Invoicing/Introduction/Guidelines/Pages/default.aspx`;
}

export function buildZatcaEducationalLibraryUrl() {
  return `${ZATCA_BASE_URL}/en/E-Invoicing/Introduction/Guidelines`;
}

export function buildZatcaSecurityRequirementsUrl() {
  return `${ZATCA_BASE_URL}/en/E-Invoicing/SystemsDevelopers/Pages/Security-Requirements.aspx`;
}

export function buildZatcaFatooraPortalUrl() {
  return ZATCA_FATOORA_PORTAL_URL;
}

export function buildZatcaOnboardingUrl() {
  return `${ZATCA_FATOORA_PORTAL_URL}/onboard-solution`;
}

export function buildZatcaSandboxRootUrl() {
  return ZATCA_SANDBOX_URL;
}

export function buildZatcaIntegrationSandboxUrl(path = "") {
  const normalizedPath = String(path || "")
    .trim()
    .replace(/^\/?IntegrationSandbox\/?/i, "")
    .replace(/^\/+/, "");
  const suffix = normalizedPath ? `/${normalizedPath}` : "";
  return `${ZATCA_INTEGRATION_SANDBOX_URL}${suffix}`;
}

export function buildZatcaComplianceSandboxUrl(path = "") {
  const normalizedPath = String(path || "")
    .trim()
    .replace(/^\/?Compliance\/?/i, "")
    .replace(/^\/+/, "");
  const suffix = normalizedPath ? `/${normalizedPath}` : "";
  return `${ZATCA_COMPLIANCE_SANDBOX_URL}${suffix}`;
}

export function buildZatcaProductionPortalUrl() {
  return `${ZATCA_BASE_URL}/en/login/Pages/login.aspx`;
}

export function buildZatcaReportingApiUrl(connection?: EInvoiceConnectionConfig | null) {
  if (connection?.sandbox !== false) {
    return `${buildZatcaIntegrationSandboxUrl("invoices/reporting/single")}`;
  }
  return `${ZATCA_FATOORA_PORTAL_URL}/e-invoicing/developer-portal/invoices/reporting/single`;
}

export function buildZatcaClearanceApiUrl(connection?: EInvoiceConnectionConfig | null) {
  if (connection?.sandbox !== false) {
    return `${buildZatcaIntegrationSandboxUrl("invoices/clearance/single")}`;
  }
  return `${ZATCA_FATOORA_PORTAL_URL}/e-invoicing/developer-portal/invoices/clearance/single`;
}

function buildZatcaAuthHeader(connection?: EInvoiceConnectionConfig | null) {
  const credentials = getZatcaCredentials(connection);
  if (!credentials.binarySecurityToken || !credentials.binarySecurityTokenSecret) {
    throw new Error("ZATCA live submission requires a binary security token and token secret.");
  }
  return `Basic ${Buffer.from(
    `${credentials.binarySecurityToken}:${credentials.binarySecurityTokenSecret}`,
    "utf8"
  ).toString("base64")}`;
}

function parseJsonSafe(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function extractZatcaErrorMessage(payload: Record<string, unknown> | null) {
  return String(
    payload?.message ||
      payload?.error ||
      payload?.title ||
      payload?.detail ||
      ""
  ).trim();
}

export function buildZatcaTransportPreparation(
  connection?: EInvoiceConnectionConfig | null
): ZatcaTransportPreparation {
  const state = buildArtifactState(connection);

  return {
    country: "SA",
    sandbox: connection?.sandbox !== false,
    portalUrl: buildZatcaFatooraPortalUrl(),
    developerPortalUrl: buildZatcaDeveloperPortalUrl(),
    onboardingUrl: buildZatcaOnboardingUrl(),
    integrationSandboxUrl: buildZatcaIntegrationSandboxUrl(),
    complianceSandboxUrl: buildZatcaComplianceSandboxUrl(),
    productionAccessRequirement:
      "Production FATOORA access requires ERAD portal credentials, OTP-based onboarding, CSID issuance, and solution-specific signing artifacts.",
    requiredArtifacts: state.requiredArtifacts,
    presentArtifacts: state.presentArtifacts,
    missingArtifacts: state.missingArtifacts,
    onboardingReady: state.onboardingReady,
    clearanceReady: state.clearanceReady,
    operationalReady: state.operationalReady,
    liveSubmissionReady: state.liveSubmissionReady,
    liveSubmissionBlockedReason: state.liveSubmissionBlockedReason,
    nextActions: state.nextActions,
    notes: [
      "Live ZATCA submission is available once onboarding, signing artifacts, and operational identifiers are configured.",
      "Phase 1 and Phase 2 have different document and security expectations, so sandbox readiness does not mean live clearance transport is complete.",
      "Status sync is available when the workspace has a provider-specific status endpoint configured.",
      "Cancellation is available when the workspace has a provider-specific cancellation endpoint configured.",
      "Use the sandbox for onboarding and validation before treating the Saudi flow as operational.",
    ],
  };
}

export function buildZatcaSigningPreparation(
  connection?: EInvoiceConnectionConfig | null
): ZatcaTransportPreparation {
  return buildZatcaTransportPreparation(connection);
}

export async function submitZatcaInvoice(input: {
  connection?: EInvoiceConnectionConfig | null;
  payload: EInvoicePayloadBuildResult;
}): Promise<EInvoiceSubmissionResult> {
  const body = (input.payload.payload || {}) as Record<string, any>;
  const transportDocument = (body.transportDocument || {}) as Record<string, unknown>;
  const submissionMode = String(body.submissionMode || transportDocument.mode || "REPORTING")
    .trim()
    .toUpperCase();
  const invoiceHash = trim(transportDocument.invoiceHash || transportDocument.digest);
  const uuid = trim(transportDocument.uuid || body.invoiceUuid);
  const invoice = trim(transportDocument.documentBase64 || body.signedInvoiceBase64);

  if (!invoiceHash || !uuid || !invoice) {
    throw new Error("ZATCA live submission requires invoice hash, UUID, and signed invoice document.");
  }

  const endpoint =
    submissionMode === "CLEARANCE"
      ? buildZatcaClearanceApiUrl(input.connection)
      : buildZatcaReportingApiUrl(input.connection);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      Authorization: buildZatcaAuthHeader(input.connection),
      "Content-Type": "application/json",
      clearanceStatus: "1",
      ...(submissionMode === "REPORTING" ? { "accept-version": "V2" } : {}),
    },
    body: JSON.stringify({
      invoiceHash,
      uuid,
      invoice,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    const errorMessage =
      extractZatcaErrorMessage(parsed) || `ZATCA submission failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  const providerReference = trim(parsed?.clearanceStatus || parsed?.reportingStatus || parsed?.uuid) || uuid;
  return {
    status: "ACCEPTED",
    submissionId: uuid,
    providerReference,
    rawResponse: parsed,
  };
}

function normalizeZatcaStatus(value: unknown): EInvoiceStatusResult["status"] {
  const normalized = trim(value).toUpperCase();
  if (normalized === "ACCEPTED" || normalized === "REPORTED" || normalized === "CLEARED" || normalized === "SUCCESS") {
    return "ACCEPTED";
  }
  if (normalized === "REJECTED" || normalized === "FAILED" || normalized === "ERROR") {
    return "REJECTED";
  }
  if (normalized === "CANCELLED" || normalized === "CANCELED") {
    return "CANCELLED";
  }
  if (normalized === "QUEUED" || normalized === "PENDING") {
    return "QUEUED";
  }
  return "SUBMITTED";
}

export async function getZatcaSubmissionStatus(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceStatusResult> {
  const credentials = getZatcaCredentials(input.connection);
  if (!credentials.statusUrl) {
    return {
      status: "SUBMITTED",
      providerReference: input.submissionId,
      rawResponse: null,
      errorMessage: "ZATCA status sync endpoint is not configured for this workspace.",
    };
  }

  const statusUrl = new URL(credentials.statusUrl);
  statusUrl.searchParams.set("submissionId", input.submissionId);
  const response = await fetch(statusUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: buildZatcaAuthHeader(input.connection),
    },
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    const errorMessage =
      extractZatcaErrorMessage(parsed) || `ZATCA status lookup failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  return {
    status: normalizeZatcaStatus(parsed?.status || parsed?.reportingStatus || parsed?.clearanceStatus),
    providerReference: trim(parsed?.providerReference || parsed?.uuid || input.submissionId) || input.submissionId,
    rawResponse: parsed,
    errorMessage: trim(parsed?.errorMessage || parsed?.message) || null,
  };
}

export async function cancelZatcaInvoice(input: {
  connection?: EInvoiceConnectionConfig | null;
  submissionId: string;
}): Promise<EInvoiceCancellationResult> {
  const credentials = getZatcaCredentials(input.connection);
  if (!credentials.cancelUrl) {
    throw new Error("ZATCA cancellation requires a cancellation URL.");
  }

  const response = await fetch(credentials.cancelUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: buildZatcaAuthHeader(input.connection),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "ZATCA",
      tin: credentials.tin,
      submissionId: input.submissionId,
    }),
  });
  const text = await response.text();
  const parsed = parseJsonSafe(text);
  if (!response.ok) {
    const errorMessage =
      extractZatcaErrorMessage(parsed) || `ZATCA cancellation failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  return {
    status: "CANCELLED",
    rawResponse: parsed,
  };
}
