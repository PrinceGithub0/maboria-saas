import { countryCodes } from "@/lib/countries";
import { allCountryComplianceModules, specializedCountryComplianceModules } from "@/lib/invoicing/blueprint/countries";
import { buildDefaultCountryModule, normalizeCountryCode } from "@/lib/invoicing/blueprint/module-factory";

const activeModulesByCountry = new Map(
  allCountryComplianceModules.map((module) => [module.countryCode, module] as const)
);

const prioritySpecializedModulesByCountry = new Map(
  specializedCountryComplianceModules.map((module) => [module.countryCode, module] as const)
);

const COUNTRY_COMPLIANCE_REGISTRY = new Map(
  countryCodes.map((countryCode) => {
    const normalizedCountryCode = normalizeCountryCode(countryCode) || countryCode;
    return [
      normalizedCountryCode,
      activeModulesByCountry.get(normalizedCountryCode) || buildDefaultCountryModule(normalizedCountryCode),
    ] as const;
  })
);

export function resolveCountryComplianceModule(countryCode?: string | null) {
  const normalized = normalizeCountryCode(countryCode);
  return normalized ? COUNTRY_COMPLIANCE_REGISTRY.get(normalized) || null : null;
}

export function listCountryComplianceModules() {
  return [...COUNTRY_COMPLIANCE_REGISTRY.values()];
}

export function listSpecializedCountryComplianceModules() {
  return [...prioritySpecializedModulesByCountry.values()];
}
