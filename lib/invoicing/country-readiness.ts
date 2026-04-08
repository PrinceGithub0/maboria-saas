import { countryCodes, getCountryName } from "@/lib/countries";
import {
  getEInvoiceCountryProductionSignoff,
  type EInvoiceProductionPromotionState,
} from "@/lib/einvoicing/production-signoffs";
import { listEInvoiceProviderDefinitions } from "@/lib/einvoicing/provider-registry";
import { getEInvoiceRolloutItem } from "@/lib/einvoicing/rollout-matrix";
import type { EInvoiceCompletionStage, EInvoiceProviderKey } from "@/lib/einvoicing/types";
import { allCountryComplianceModules } from "@/lib/invoicing/blueprint/countries";
import { resolveCountryComplianceModule } from "@/lib/invoicing/blueprint/registry";
import type { CountryComplianceModule } from "@/lib/invoicing/blueprint/types";
import { getCountryInvoiceRule } from "@/lib/invoicing/country-rules";
import type { SupportLevel, TaxSystem } from "@/lib/invoicing/types";

export type CountryLaunchState = "LIVE" | "BETA" | "MANUAL_REVIEW" | "NOT_READY";

export type CountryLaunchChecklist = {
  taxRulesReady: boolean;
  activeBlueprintReady: boolean;
  evidenceReady: boolean;
  eInvoicingRequired: boolean;
  eInvoicingProviderReady: boolean;
  eInvoicingProductionReady: boolean;
  eInvoicingSignoffReady: boolean;
};

export type CountryLaunchReadiness = {
  countryCode: string;
  countryName: string;
  launchState: CountryLaunchState;
  supportLevel: SupportLevel | null;
  taxSystem: TaxSystem | null;
  requiresEInvoicing: boolean;
  activeBlueprintImplementation: CountryComplianceModule["implementationType"] | null;
  researchedBlueprintImplementation: CountryComplianceModule["implementationType"] | null;
  evidenceCount: number;
  lastReviewedAt: string | null;
  eInvoiceProviderKey: EInvoiceProviderKey | null;
  eInvoiceCompletionStage: EInvoiceCompletionStage | null;
  eInvoiceProductionReady: boolean;
  eInvoicePromotionState: EInvoiceProductionPromotionState | null;
  eInvoicePromotionPriority: number | null;
  eInvoiceProductionReviewedAt: string | null;
  blockers: string[];
  checklist: CountryLaunchChecklist;
};

const researchedModulesByCountry = new Map(
  allCountryComplianceModules.map((module) => [module.countryCode, module] as const)
);

const providerByCountry = new Map(
  listEInvoiceProviderDefinitions().flatMap((definition) =>
    definition.countryCodes.map((countryCode) => [countryCode, definition] as const)
  )
);

const getLatestReviewedAt = (module?: CountryComplianceModule | null) => {
  const reviewedDates = (module?.evidence || [])
    .map((evidence) => String(evidence.reviewedAt || "").trim())
    .filter(Boolean)
    .sort();
  return reviewedDates.at(-1) || null;
};

export function getCountryLaunchReadiness(countryCode?: string | null): CountryLaunchReadiness | null {
  const normalizedCountryCode = String(countryCode || "").trim().toUpperCase();
  if (!normalizedCountryCode) return null;

  const rule = getCountryInvoiceRule(normalizedCountryCode);
  const activeBlueprintModule = resolveCountryComplianceModule(normalizedCountryCode);
  const researchedBlueprintModule =
    researchedModulesByCountry.get(normalizedCountryCode) || activeBlueprintModule || null;
  const provider = providerByCountry.get(normalizedCountryCode) || null;
  const rollout = getEInvoiceRolloutItem(normalizedCountryCode);
  const eInvoiceSignoff = getEInvoiceCountryProductionSignoff(normalizedCountryCode);
  const evidenceCount = researchedBlueprintModule?.evidence?.length || 0;
  const hasEvidence = evidenceCount > 0;
  const requiresEInvoicing = Boolean(rule?.requiresEInvoicing);
  const eInvoicingProviderReady = !requiresEInvoicing || Boolean(provider);
  const eInvoicingProductionReady = !requiresEInvoicing || Boolean(eInvoiceSignoff?.productionReady);
  const activeBlueprintReady = activeBlueprintModule?.implementationType === "SPECIALIZED";
  const researchedBlueprintReady = researchedBlueprintModule?.implementationType === "SPECIALIZED";
  const limitedSupportNeedsPromotion =
    rule?.supportLevel === "LIMITED" && (!requiresEInvoicing || !eInvoicingProductionReady);

  const blockers = [
    !rule ? "No country invoice tax rule is registered yet." : null,
    !hasEvidence ? "Country-specific legal evidence has not been attached yet." : null,
    researchedBlueprintReady && !activeBlueprintReady
      ? "Country blueprint research exists but is not active in the laúnch validator."
      : null,
    limitedSupportNeedsPromotion
      ? requiresEInvoicing
        ? "Country is still classified as limited-support until its e-invoicing go-live signoff is completed."
        : "Country is still classified as limited-support and requires manual review."
      : null,
    requiresEInvoicing && !provider
      ? "Required e-invoicing provider is not configured in the app yet."
      : null,
    ...(requiresEInvoicing && provider && !eInvoicingProductionReady ? eInvoiceSignoff?.blockers || [] : []),
  ].filter(Boolean) as string[];

  let launchState: CountryLaunchState = "NOT_READY";
  if (!rule) {
    launchState = "NOT_READY";
  } else if (requiresEInvoicing && !provider) {
    launchState = "NOT_READY";
  } else if (!hasEvidence) {
    launchState = "NOT_READY";
  } else if (limitedSupportNeedsPromotion || (requiresEInvoicing && !eInvoicingProductionReady)) {
    launchState = "MANUAL_REVIEW";
  } else if (activeBlueprintReady && hasEvidence) {
    launchState = "LIVE";
  } else if (researchedBlueprintReady && hasEvidence) {
    launchState = "BETA";
  }

  return {
    countryCode: normalizedCountryCode,
    countryName: getCountryName(normalizedCountryCode, "en"),
    launchState,
    supportLevel: rule?.supportLevel || null,
    taxSystem: rule?.taxSystem || null,
    requiresEInvoicing,
    activeBlueprintImplementation: activeBlueprintModule?.implementationType || null,
    researchedBlueprintImplementation: researchedBlueprintModule?.implementationType || null,
    evidenceCount,
    lastReviewedAt: getLatestReviewedAt(researchedBlueprintModule),
    eInvoiceProviderKey: provider?.key || null,
    eInvoiceCompletionStage: rollout?.completionStage || provider?.completionStage || null,
    eInvoiceProductionReady: eInvoicingProductionReady,
    eInvoicePromotionState: eInvoiceSignoff?.promotionState || null,
    eInvoicePromotionPriority: eInvoiceSignoff?.nextPriority || null,
    eInvoiceProductionReviewedAt: eInvoiceSignoff?.reviewedAt || null,
    blockers,
    checklist: {
      taxRulesReady: Boolean(rule),
      activeBlueprintReady,
      evidenceReady: hasEvidence,
      eInvoicingRequired: requiresEInvoicing,
      eInvoicingProviderReady,
      eInvoicingProductionReady,
      eInvoicingSignoffReady: !requiresEInvoicing || Boolean(eInvoiceSignoff?.productionReady),
    },
  };
}

export function isCountryLaunchReady(countryCode?: string | null) {
  return getCountryLaunchReadiness(countryCode)?.launchState === "LIVE";
}

export function listCountryLaunchReadiness() {
  return countryCodes
    .map((countryCode) => getCountryLaunchReadiness(countryCode))
    .filter(Boolean) as CountryLaunchReadiness[];
}
