import { countryCodes, getCountryName } from "@/lib/countries";
import { getEInvoiceCountryProductionSignoff } from "@/lib/einvoicing/production-signoffs";
import { allCountryComplianceModules } from "@/lib/invoicing/blueprint/countries";
import { resolveCountryComplianceModule } from "@/lib/invoicing/blueprint/registry";
import type { ComplianceRuleEvidence, CountryComplianceModule } from "@/lib/invoicing/blueprint/types";
import { getCountryInvoiceRule } from "@/lib/invoicing/country-rules";
import type { SupportLevel } from "@/lib/invoicing/types";

export type RegulatoryReviewStatus = "COMPLETE" | "MISSING_SOURCE_EVIDENCE";

export type CountryRegulatoryReview = {
  countryCode: string;
  countryName: string;
  owner: string;
  supportLevel: SupportLevel | null;
  requiresEInvoicing: boolean;
  sourceEvidenceCount: number;
  sourceEvidence: ComplianceRuleEvidence[];
  signoffEvidenceCount: number;
  lastReviewedAt: string | null;
  nextReviewDueAt: string | null;
  cadenceDays: number;
  status: RegulatoryReviewStatus;
  notes: string[];
};

const researchedModulesByCountry = new Map(
  allCountryComplianceModules.map((complianceModule) => [complianceModule.countryCode, complianceModule] as const)
);

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getCadenceDays(input: { requiresEInvoicing: boolean; supportLevel: SupportLevel | null }) {
  if (input.requiresEInvoicing) return 90;
  if (input.supportLevel === "LIMITED") return 120;
  if (input.supportLevel === "ADVANCED") return 180;
  return 365;
}

function getOwner(input: { requiresEInvoicing: boolean; supportLevel: SupportLevel | null }) {
  if (input.requiresEInvoicing) return "compliance-platform";
  if (input.supportLevel === "LIMITED") return "tax-operations";
  return "tax-content";
}

function getLatestReviewedAt(input: {
  sourceEvidence: ComplianceRuleEvidence[];
  signoffReviewedAt?: string | null;
}) {
  const dates = [
    ...input.sourceEvidence.map((item) => String(item.reviewedAt || "").trim()),
    String(input.signoffReviewedAt || "").trim(),
  ]
    .filter(Boolean)
    .sort();
  return dates.at(-1) || null;
}

function getCountryModule(countryCode: string): CountryComplianceModule | null {
  return researchedModulesByCountry.get(countryCode) || resolveCountryComplianceModule(countryCode) || null;
}

export function getCountryRegulatoryReview(countryCode?: string | null): CountryRegulatoryReview | null {
  const normalizedCountryCode = String(countryCode || "").trim().toUpperCase();
  if (!normalizedCountryCode) return null;

  const rule = getCountryInvoiceRule(normalizedCountryCode);
  const complianceModule = getCountryModule(normalizedCountryCode);
  const signoff = getEInvoiceCountryProductionSignoff(normalizedCountryCode);
  const sourceEvidence = [...(complianceModule?.evidence || [])];
  const requiresEInvoicing = Boolean(rule?.requiresEInvoicing);
  const supportLevel = rule?.supportLevel || complianceModule?.supportLevel || null;
  const owner = getOwner({ requiresEInvoicing, supportLevel });
  const cadenceDays = getCadenceDays({ requiresEInvoicing, supportLevel });
  const lastReviewedAt = getLatestReviewedAt({
    sourceEvidence,
    signoffReviewedAt: signoff?.reviewedAt || null,
  });
  const nextReviewDueAt = lastReviewedAt ? addDays(lastReviewedAt, cadenceDays) : null;
  const notes = [
    complianceModule?.ruleVersion ? `Rule version ${complianceModule.ruleVersion}` : null,
    requiresEInvoicing ? "Mandatory or managed e-invoicing review cadence applies." : null,
    signoff?.notes || null,
  ].filter(Boolean) as string[];

  return {
    countryCode: normalizedCountryCode,
    countryName: getCountryName(normalizedCountryCode, "en"),
    owner,
    supportLevel,
    requiresEInvoicing,
    sourceEvidenceCount: sourceEvidence.length,
    sourceEvidence,
    signoffEvidenceCount: signoff?.evidenceCount || 0,
    lastReviewedAt,
    nextReviewDueAt,
    cadenceDays,
    status: sourceEvidence.length > 0 ? "COMPLETE" : "MISSING_SOURCE_EVIDENCE",
    notes,
  };
}

export function listCountryRegulatoryReviews() {
  return countryCodes
    .map((countryCode) => getCountryRegulatoryReview(countryCode))
    .filter(Boolean) as CountryRegulatoryReview[];
}
