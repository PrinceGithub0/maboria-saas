import type { EInvoiceConnectionConfig } from "@/lib/einvoicing/types";
import type { EInvoiceProviderDefinition } from "@/lib/einvoicing/provider-registry";
import type { EInvoiceRolloutItem } from "@/lib/einvoicing/rollout-matrix";

type CredentialSource =
  | Pick<EInvoiceConnectionConfig, "credentials" | "status" | "sandbox" | "hasCredentials" | "lastValidatedAt" | "lastError">
  | {
      credentialKeys?: string[] | null;
      status?: string | null;
      sandbox?: boolean | null;
      hasCredentials?: boolean | null;
      lastValidatedAt?: string | null;
      lastError?: string | null;
    };

export type EInvoiceReadinessGate = {
  key:
    | "active_connection"
    | "required_credentials"
    | "live_submission"
    | "status_sync"
    | "cancellation"
    | "sandbox_disabled"
    | "connection_validated"
    | "provider_error_free";
  label: string;
  passed: boolean;
  message: string;
};

export type EInvoiceReadinessAssessment = {
  syncReady: boolean;
  cancelReady: boolean;
  productionReady: boolean;
  blockers: string[];
  gates: EInvoiceReadinessGate[];
};

const trim = (value: unknown) => String(value || "").trim();

type SupplementalCredentialRequirement = {
  label: string;
  keys: string[];
};

function getSupplementalCredentialRequirements(
  providerDefinition?: EInvoiceProviderDefinition | null
): SupplementalCredentialRequirement[] {
  switch (providerDefinition?.key) {
    case "ZATCA":
      return [
        { label: "portalUsername", keys: ["portalUsername"] },
        { label: "portalPassword", keys: ["portalPassword"] },
        { label: "otp", keys: ["otp"] },
        { label: "csr", keys: ["csr"] },
        { label: "csid", keys: ["csid"] },
        { label: "privateKeyPem", keys: ["privateKeyPem"] },
        { label: "certificatePem", keys: ["certificatePem"] },
        { label: "binarySecurityToken", keys: ["binarySecurityToken"] },
        { label: "binarySecurityTokenSecret", keys: ["binarySecurityTokenSecret"] },
        { label: "complianceRequestId", keys: ["complianceRequestId"] },
        { label: "egsSerialNumber", keys: ["egsSerialNumber"] },
      ];
    case "IT_SDI":
      return [
        { label: "transmissionId", keys: ["transmissionId"] },
        { label: "recipientCode or pecEmail", keys: ["recipientCode", "pecEmail"] },
        { label: "certificatePem", keys: ["certificatePem"] },
        { label: "privateKeyPem", keys: ["privateKeyPem"] },
      ];
    case "MX_CFDI":
      return [
        { label: "csdCertificatePem", keys: ["csdCertificatePem"] },
        { label: "csdPrivateKeyPem", keys: ["csdPrivateKeyPem"] },
        { label: "csdPrivateKeyPassword", keys: ["csdPrivateKeyPassword"] },
      ];
    default:
      return [];
  }
}

function getCredentialKeySet(connection?: CredentialSource | null) {
  const explicitKeys = Array.isArray((connection as { credentialKeys?: string[] | null } | null)?.credentialKeys)
    ? ((connection as { credentialKeys?: string[] | null }).credentialKeys || [])
    : null;
  if (explicitKeys) {
    return new Set(explicitKeys.map((key) => trim(key)).filter(Boolean));
  }

  const credentials = (connection as EInvoiceConnectionConfig | null)?.credentials;
  if (!credentials || typeof credentials !== "object") {
    return new Set<string>();
  }

  return new Set(
    Object.entries(credentials)
      .filter(([, value]) => trim(value))
      .map(([key]) => trim(key))
      .filter(Boolean)
  );
}

function getFieldKeys(providerDefinition: EInvoiceProviderDefinition | null | undefined, pattern: RegExp) {
  return (providerDefinition?.credentialFields || [])
    .map((field) => trim(field.key))
    .filter((key) => pattern.test(key));
}

export function assessEInvoiceReadiness(input: {
  providerDefinition?: EInvoiceProviderDefinition | null;
  rollout?: EInvoiceRolloutItem | null;
  connection?: CredentialSource | null;
  liveSubmissionImplemented: boolean;
  statusSyncImplemented: boolean;
  cancellationImplemented: boolean;
}): EInvoiceReadinessAssessment {
  const credentialKeys = getCredentialKeySet(input.connection);
  const requiredCredentialKeys = (input.providerDefinition?.credentialFields || [])
    .filter((field) => field.required)
    .map((field) => trim(field.key))
    .filter(Boolean);
  const supplementalRequirements = getSupplementalCredentialRequirements(input.providerDefinition);
  const statusFieldKeys = getFieldKeys(input.providerDefinition, /status/i);
  const cancellationFieldKeys = getFieldKeys(input.providerDefinition, /cancel/i);
  const activeConnection = trim(input.connection?.status).toUpperCase() === "ACTIVE";
  const missingRequiredCredentials = requiredCredentialKeys.filter((key) => !credentialKeys.has(key));
  const missingSupplementalCredentials = supplementalRequirements
    .filter((requirement) => !requirement.keys.some((key) => credentialKeys.has(key)))
    .map((requirement) => requirement.label);
  const hasRequiredCredentials =
    missingRequiredCredentials.length === 0 && missingSupplementalCredentials.length === 0;
  const statusSyncConfigured =
    !input.statusSyncImplemented ||
    statusFieldKeys.length === 0 ||
    statusFieldKeys.some((key) => credentialKeys.has(key));
  const statusSyncReady = input.statusSyncImplemented && statusSyncConfigured;
  const cancellationConfigured =
    !input.cancellationImplemented ||
    cancellationFieldKeys.length === 0 ||
    cancellationFieldKeys.some((key) => credentialKeys.has(key));
  const sandboxDisabled = input.connection?.sandbox === false;
  const connectionValidated = Boolean(trim(input.connection?.lastValidatedAt));
  const providerErrorFree = !trim(input.connection?.lastError);
  const cancelReady = input.cancellationImplemented && cancellationConfigured;

  const gates: EInvoiceReadinessGate[] = [
    {
      key: "active_connection",
      label: "Active connection",
      passed: activeConnection && Boolean(input.connection?.hasCredentials),
      message: "The workspace needs an active e-invoicing connection with stored credentials.",
    },
    {
      key: "required_credentials",
      label: "Required credentials",
      passed: Boolean(input.connection?.hasCredentials) && hasRequiredCredentials,
      message:
        missingRequiredCredentials.length || missingSupplementalCredentials.length
          ? `Missing required credentials: ${[...missingRequiredCredentials, ...missingSupplementalCredentials].join(", ")}.`
          : "Required credential fields are not complete.",
    },
    {
      key: "live_submission",
      label: "Live submission",
      passed: input.liveSubmissionImplemented,
      message:
        input.providerDefinition?.capabilitySummary ||
        input.rollout?.notes ||
        "Live submission is not available for this provider yet.",
    },
    {
      key: "status_sync",
      label: "Status sync",
      passed: statusSyncReady,
      message:
        input.statusSyncImplemented && !statusSyncConfigured
          ? "A status sync endpoint is not configured for this provider connection."
          : "Automated status sync is not available for this provider yet.",
    },
    {
      key: "cancellation",
      label: "Cancellation",
      passed: cancelReady,
      message:
        input.cancellationImplemented && !cancellationConfigured
          ? "A cancellation endpoint is not configured for this provider connection."
          : "Cancellation support is not implemented for this provider yet.",
    },
    {
      key: "sandbox_disabled",
      label: "Production mode",
      passed: sandboxDisabled,
      message: "The connection is still configured in sandbox mode.",
    },
    {
      key: "connection_validated",
      label: "Connection validation",
      passed: connectionValidated,
      message: "The production connection has not been validated and timestamped yet.",
    },
    {
      key: "provider_error_free",
      label: "Last provider validation",
      passed: providerErrorFree,
      message: trim(input.connection?.lastError) || "The provider connection still reports an unresolved error.",
    },
  ];

  const blockers = gates.filter((gate) => !gate.passed).map((gate) => gate.message);
  const productionReady = blockers.length === 0;

  return {
    syncReady: statusSyncReady,
    cancelReady,
    productionReady,
    blockers,
    gates,
  };
}
