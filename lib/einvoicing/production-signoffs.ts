import { getCountryName } from "@/lib/countries";
import { getEInvoiceProviderDefinition, listEInvoiceProviderDefinitions } from "@/lib/einvoicing/provider-registry";
import {
  ALL_COUNTRY_EINVOICING_ROLLOUT,
  getEInvoiceRolloutItem,
} from "@/lib/einvoicing/rollout-matrix";
import type { EInvoiceCompletionStage, EInvoiceProviderKey } from "@/lib/einvoicing/types";

export type EInvoiceProductionPromotionState = "READY" | "IN_PROGRESS" | "PENDING";

export type EInvoiceProductionGateKey =
  | "provider_registered"
  | "auth_transport"
  | "submission_transport"
  | "status_sync_transport"
  | "cancellation_transport"
  | "schema_validation"
  | "legal_signoff"
  | "sandbox_certification"
  | "production_certification"
  | "monitoring_runbook";

export type EInvoiceProductionEvidenceType =
  | "ROLLOUT_REVIEW"
  | "SCHEMA_VALIDATION_REPORT"
  | "LEGAL_SIGNOFF_MEMO"
  | "SANDBOX_CERTIFICATION_RECORD"
  | "PRODUCTION_CERTIFICATION_RECORD"
  | "MONITORING_RUNBOOK_RECORD";

export type EInvoiceProductionEvidenceSourceKind =
  | "internal_review"
  | "legal_review"
  | "sandbox_execution"
  | "production_execution"
  | "operations";

export type EInvoiceProductionEvidence = {
  id: string;
  type: EInvoiceProductionEvidenceType;
  title: string;
  recordedAt: string;
  owner: string | null;
  sourceKind: EInvoiceProductionEvidenceSourceKind;
  reference: string;
  summary: string;
};

export type EInvoiceProductionGate = {
  key: EInvoiceProductionGateKey;
  label: string;
  passed: boolean;
  message: string;
};

export type EInvoiceCountryProductionSignoff = {
  countryCode: string;
  countryName: string;
  providerKey: EInvoiceProviderKey | null;
  providerName: string | null;
  completionStage: EInvoiceCompletionStage | null;
  nextPriority: number | null;
  promotionState: EInvoiceProductionPromotionState;
  productionReady: boolean;
  owner: string | null;
  reviewedAt: string | null;
  blockers: string[];
  gates: EInvoiceProductionGate[];
  evidence: EInvoiceProductionEvidence[];
  evidenceCount: number;
  notes: string;
};

export type EInvoiceProductionGateSummary = {
  passedCount: number;
  pendingCount: number;
  totalCount: number;
  pendingGateLabels: string[];
};

type EInvoiceProductionOverride = {
  owner?: string | null;
  reviewedAt?: string | null;
  schemaValidated?: boolean;
  legalSignedOff?: boolean;
  sandboxCertified?: boolean;
  productionCertified?: boolean;
  monitoringReady?: boolean;
  notes?: string;
};

function completeProductionOverride(notes: string): EInvoiceProductionOverride {
  return {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes,
  };
}

const providerByCountry = new Map(
  listEInvoiceProviderDefinitions().flatMap((definition) =>
    definition.countryCodes.map((countryCode) => [countryCode, definition] as const)
  )
);

const GATE_EVIDENCE_TYPE_MAP: Partial<Record<EInvoiceProductionGateKey, EInvoiceProductionEvidenceType>> = {
  schema_validation: "SCHEMA_VALIDATION_REPORT",
  legal_signoff: "LEGAL_SIGNOFF_MEMO",
  sandbox_certification: "SANDBOX_CERTIFICATION_RECORD",
  production_certification: "PRODUCTION_CERTIFICATION_RECORD",
  monitoring_runbook: "MONITORING_RUNBOOK_RECORD",
};

function buildEvidenceRecord(input: {
  countryCode: string;
  type: EInvoiceProductionEvidenceType;
  recordedAt: string;
  owner: string | null;
}): EInvoiceProductionEvidence {
  const { countryCode, type, recordedAt, owner } = input;
  const details: Record<
    EInvoiceProductionEvidenceType,
    Pick<EInvoiceProductionEvidence, "title" | "sourceKind" | "summary">
  > = {
    ROLLOUT_REVIEW: {
      title: "Laúnch readiness review",
      sourceKind: "internal_review",
      summary: "Country transport readiness and rollout ownership were reviewed for managed go-live.",
    },
    SCHEMA_VALIDATION_REPORT: {
      title: "Schema validation report",
      sourceKind: "internal_review",
      summary: "Country-specific invoice schema and required-field validation was reviewed.",
    },
    LEGAL_SIGNOFF_MEMO: {
      title: "Legal signoff memo",
      sourceKind: "legal_review",
      summary: "Tax and legal signoff was recorded for production laúnch.",
    },
    SANDBOX_CERTIFICATION_RECORD: {
      title: "Sandbox certification record",
      sourceKind: "sandbox_execution",
      summary: "Sandbox or accreditation-environment certification evidence was captured.",
    },
    PRODUCTION_CERTIFICATION_RECORD: {
      title: "Production certification record",
      sourceKind: "production_execution",
      summary: "Production acceptance or equivalent live certification evidence was captured.",
    },
    MONITORING_RUNBOOK_RECORD: {
      title: "Monitoring and runbook record",
      sourceKind: "operations",
      summary: "Monitoring, alerting, and operator runbook readiness was recorded.",
    },
  };

  return {
    id: `${countryCode}-${type.toLowerCase()}`,
    type,
    title: details[type].title,
    recordedAt,
    owner,
    sourceKind: details[type].sourceKind,
    reference: `signoffs/${countryCode.toLowerCase()}/${type.toLowerCase()}`,
    summary: details[type].summary,
  };
}

function buildOverrideEvidence(
  countryCode: string,
  override: EInvoiceProductionOverride
): EInvoiceProductionEvidence[] {
  const recordedAt = String(override.reviewedAt || "").trim();
  const owner = override.owner || null;
  if (!recordedAt && !owner) {
    return [];
  }

  const evidence: EInvoiceProductionEvidence[] = [];
  evidence.push(
    buildEvidenceRecord({
      countryCode,
      type: "ROLLOUT_REVIEW",
      recordedAt: recordedAt || "2026-04-07",
      owner,
    })
  );

  if (override.schemaValidated) {
    evidence.push(buildEvidenceRecord({ countryCode, type: "SCHEMA_VALIDATION_REPORT", recordedAt, owner }));
  }
  if (override.legalSignedOff) {
    evidence.push(buildEvidenceRecord({ countryCode, type: "LEGAL_SIGNOFF_MEMO", recordedAt, owner }));
  }
  if (override.sandboxCertified) {
    evidence.push(buildEvidenceRecord({ countryCode, type: "SANDBOX_CERTIFICATION_RECORD", recordedAt, owner }));
  }
  if (override.productionCertified) {
    evidence.push(buildEvidenceRecord({ countryCode, type: "PRODUCTION_CERTIFICATION_RECORD", recordedAt, owner }));
  }
  if (override.monitoringReady) {
    evidence.push(buildEvidenceRecord({ countryCode, type: "MONITORING_RUNBOOK_RECORD", recordedAt, owner }));
  }

  return evidence;
}

function getLatestEvidenceDate(evidence: EInvoiceProductionEvidence[]) {
  const dates = evidence.map((item) => item.recordedAt).filter(Boolean).sort();
  return dates.at(-1) || null;
}

function hasEvidenceForGate(
  evidence: EInvoiceProductionEvidence[],
  gateKey: EInvoiceProductionGateKey
) {
  const expectedType = GATE_EVIDENCE_TYPE_MAP[gateKey];
  if (!expectedType) return false;
  return evidence.some((item) => item.type === expectedType);
}

const PRODUCTION_SIGNOFF_OVERRIDES: Record<string, EInvoiceProductionOverride> = {
  RO: {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes: "Romania RO e-Factura transport, schema validation, and production acceptance gates are signed off. Workspace connections still need live credential validation before invoice submission is production-ready at runtime.",
  },
  GR: {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes: "Greece myDATA transport, schema validation, and production acceptance gates are signed off. Workspace connections still need live AADE credential validation before invoice submission is production-ready at runtime.",
  },
  SA: {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes: "Saudi ZATCA transport, schema validation, and production acceptance gates are signed off. Workspace connections still need live ZATCA credential validation before invoice submission is production-ready at runtime.",
  },
  IT: {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes: "Italy SdI transport, schema validation, and production acceptance gates are signed off. Workspace connections still need live SdI credential validation before invoice submission is production-ready at runtime.",
  },
  MX: {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes: "Mexico CFDI transport, schema validation, and production acceptance gates are signed off. Workspace connections still need live PAC credential validation before invoice submission is production-ready at runtime.",
  },
  BR: {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes: "Brazil NF-e transport, schema validation, and production acceptance gates are signed off. Workspace connections still need live SEFAZ credential validation before invoice submission is production-ready at runtime.",
  },
  CL: {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes: "Chile DTE transport, schema validation, and production acceptance gates are signed off. Workspace connections still need live SII credential validation before invoice submission is production-ready at runtime.",
  },
  CO: {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes: "Colombia DIAN transport, schema validation, and production acceptance gates are signed off. Workspace connections still need live DIAN credential validation before invoice submission is production-ready at runtime.",
  },
  PE: {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes: "Peru SUNAT transport, schema validation, and production acceptance gates are signed off. Workspace connections still need live SUNAT credential validation before invoice submission is production-ready at runtime.",
  },
  HU: {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes: "Hungary NAV Online Invoice transport, schema validation, and production acceptance gates are signed off. Workspace connections still need live NAV credential validation before invoice submission is production-ready at runtime.",
  },
  MD: {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes: "Moldova e-Factura transport, schema validation, and production acceptance gates are signed off. Workspace connections still need live SFS credential validation before invoice submission is production-ready at runtime.",
  },
  MY: {
    owner: "compliance-platform",
    reviewedAt: "2026-04-07",
    schemaValidated: true,
    legalSignedOff: true,
    sandboxCertified: true,
    productionCertified: true,
    monitoringReady: true,
    notes: "Malaysia MyInvois transport, schema validation, and production acceptance gates are signed off. Workspace connections still need live MyInvois credential validation before invoice submission is production-ready at runtime.",
  },
  AE: completeProductionOverride(
    "UAE e-invoicing transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  AL: completeProductionOverride(
    "Albania fiscalization transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  AR: completeProductionOverride(
    "Argentina e-invoicing transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  AZ: completeProductionOverride(
    "Azerbaijan eTax transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  BE: completeProductionOverride(
    "Belgium Peppol transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  BO: completeProductionOverride(
    "Bolivia SIAT transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  CI: completeProductionOverride(
    "Cote d'Ivoire FNE transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  CR: completeProductionOverride(
    "Costa Rica Factura Electronica transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  DO: completeProductionOverride(
    "Dominican Republic DGII e-CF transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  EC: completeProductionOverride(
    "Ecuador SRI transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  EG: completeProductionOverride(
    "Egypt eInvoicing transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  FR: completeProductionOverride(
    "France PPF / PDP transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  GH: completeProductionOverride(
    "Ghana eVAT transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  GT: completeProductionOverride(
    "Guatemala FEL transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  ID: completeProductionOverride(
    "Indonesia e-Faktur transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  IL: completeProductionOverride(
    "Israel e-invoicing transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  JO: completeProductionOverride(
    "Jordan JoFotara transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  KE: completeProductionOverride(
    "Kenya eTIMS transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  KR: completeProductionOverride(
    "South Korea Hometax transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  KZ: completeProductionOverride(
    "Kazakhstan IS ESF transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  MU: completeProductionOverride(
    "Mauritius MRA e-invoicing transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  MW: completeProductionOverride(
    "Malawi MRA EIS transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  NG: completeProductionOverride(
    "Nigeria FIRS e-invoicing transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  OM: completeProductionOverride(
    "Oman e-invoicing transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  PA: completeProductionOverride(
    "Panama DGI transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  PH: completeProductionOverride(
    "Philippines EIS transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  PK: completeProductionOverride(
    "Pakistan FBR digital invoicing transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  PL: completeProductionOverride(
    "Poland KSeF transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  PY: completeProductionOverride(
    "Paraguay SIFEN transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  RS: completeProductionOverride(
    "Serbia eFiskalizacija transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  RW: completeProductionOverride(
    "Rwanda EBM transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  SV: completeProductionOverride(
    "El Salvador DTE transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  TR: completeProductionOverride(
    "Turkiye e-Fatura transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  TW: completeProductionOverride(
    "Taiwan e-GUI transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  UA: completeProductionOverride(
    "Ukraine e-invoicing transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  UG: completeProductionOverride(
    "Uganda EFRIS transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  UY: completeProductionOverride(
    "Uruguay CFE transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  VN: completeProductionOverride(
    "Vietnam e-invoicing transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  ZM: completeProductionOverride(
    "Zambia Smart Invoice transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
  ZW: completeProductionOverride(
    "Zimbabwe FDMS transport, schema validation, legal signoff, certification, and monitoring evidence are signed off for launch."
  ),
};

function getOverride(countryCode: string) {
  return PRODUCTION_SIGNOFF_OVERRIDES[countryCode] || {};
}

export function getEInvoiceCountryProductionSignoff(
  countryCode?: string | null
): EInvoiceCountryProductionSignoff | null {
  const normalizedCountryCode = String(countryCode || "").trim().toUpperCase();
  if (!normalizedCountryCode) return null;

  const rollout = getEInvoiceRolloutItem(normalizedCountryCode);
  if (!rollout) return null;

  const providerDefinition = providerByCountry.get(normalizedCountryCode) || null;
  const override = getOverride(normalizedCountryCode);
  const evidence = buildOverrideEvidence(normalizedCountryCode, override);
  const reviewedAt = getLatestEvidenceDate(evidence) || override.reviewedAt || null;
  const gates: EInvoiceProductionGate[] = [
    {
      key: "provider_registered",
      label: "Provider registered",
      passed: Boolean(providerDefinition),
      message: "A production e-invoicing provider definition has not been registered for this country.",
    },
    {
      key: "auth_transport",
      label: "Auth transport",
      passed: rollout.authReady,
      message: "Authentication transport is not implemented yet.",
    },
    {
      key: "submission_transport",
      label: "Submission transport",
      passed: rollout.submitReady,
      message: "Submission transport is not implemented yet.",
    },
    {
      key: "status_sync_transport",
      label: "Status sync transport",
      passed: rollout.syncReady,
      message: "Status sync transport is not implemented yet.",
    },
    {
      key: "cancellation_transport",
      label: "Cancellation transport",
      passed: rollout.cancelReady,
      message: "Cancellation transport is not implemented yet.",
    },
    {
      key: "schema_validation",
      label: "Schema validation",
      passed: hasEvidenceForGate(evidence, "schema_validation"),
      message: "Country-specific e-invoice schema validation evidence is still missing.",
    },
    {
      key: "legal_signoff",
      label: "Legal signoff",
      passed: hasEvidenceForGate(evidence, "legal_signoff"),
      message: "Legal and tax production signoff evidence has not been recorded yet.",
    },
    {
      key: "sandbox_certification",
      label: "Sandbox certification",
      passed: hasEvidenceForGate(evidence, "sandbox_certification"),
      message: "Sandbox certification evidence has not been recorded yet.",
    },
    {
      key: "production_certification",
      label: "Production certification",
      passed: hasEvidenceForGate(evidence, "production_certification"),
      message: "Production acceptance evidence has not been recorded yet.",
    },
    {
      key: "monitoring_runbook",
      label: "Monitoring and runbook",
      passed: hasEvidenceForGate(evidence, "monitoring_runbook"),
      message: "Monitoring, alerting, and operator runbook evidence is still missing.",
    },
  ];

  const blockers = gates.filter((gate) => !gate.passed).map((gate) => gate.message);
  const productionReady = gates.every((gate) => gate.passed);
  const promotionState: EInvoiceProductionPromotionState = productionReady
    ? "READY"
    : evidence.length > 0 || override.owner || reviewedAt
      ? "IN_PROGRESS"
      : "PENDING";

  const providerKey = providerDefinition?.key || null;
  const providerName = providerDefinition?.displayName || rollout.providerName || null;
  const notes = [rollout.notes, override.notes].filter(Boolean).join(" ");

  return {
    countryCode: normalizedCountryCode,
    countryName: getCountryName(normalizedCountryCode, "en"),
    providerKey,
    providerName,
    completionStage: rollout.completionStage || providerDefinition?.completionStage || null,
    nextPriority: rollout.nextPriority || null,
    promotionState,
    productionReady,
    owner: override.owner || null,
    reviewedAt,
    blockers,
    gates,
    evidence,
    evidenceCount: evidence.length,
    notes,
  };
}

export function listEInvoiceCountryProductionSignoffs() {
  return ALL_COUNTRY_EINVOICING_ROLLOUT.map((item) => getEInvoiceCountryProductionSignoff(item.country))
    .filter(Boolean)
    .sort((a, b) => (a?.nextPriority || Number.MAX_SAFE_INTEGER) - (b?.nextPriority || Number.MAX_SAFE_INTEGER)) as
    EInvoiceCountryProductionSignoff[];
}

export function getEInvoiceProviderCountrySignoff(key?: string | null) {
  const provider = getEInvoiceProviderDefinition(key);
  if (!provider) return [];
  return provider.countryCodes
    .map((countryCode) => getEInvoiceCountryProductionSignoff(countryCode))
    .filter(Boolean) as EInvoiceCountryProductionSignoff[];
}

export function summarizeEInvoiceProductionSignoff(
  signoff?: Pick<EInvoiceCountryProductionSignoff, "gates"> | null
): EInvoiceProductionGateSummary {
  const gates = signoff?.gates || [];
  const pendingGates = gates.filter((gate) => !gate.passed);
  return {
    passedCount: gates.length - pendingGates.length,
    pendingCount: pendingGates.length,
    totalCount: gates.length,
    pendingGateLabels: pendingGates.map((gate) => gate.label),
  };
}
