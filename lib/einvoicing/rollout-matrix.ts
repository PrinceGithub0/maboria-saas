import type { EInvoiceCompletionStage } from "@/lib/einvoicing/types";
import { PLANNED_COUNTRY_EINVOICING_ROLLOUT } from "@/lib/einvoicing/planned-rollout-matrix";

export type EInvoiceRolloutItem = {
  country: string;
  displayName: string;
  providerName: string;
  completionStage: EInvoiceCompletionStage;
  authReady: boolean;
  submitReady: boolean;
  syncReady: boolean;
  cancelReady: boolean;
  productionReady: boolean;
  nextPriority: number;
  notes: string;
};

export const LIMITED_COUNTRY_EINVOICING_ROLLOUT = [
  {
    country: "RO",
    displayName: "Romania",
    providerName: "RO e-Factura",
    completionStage: "PRODUCTION_READY",
    authReady: true,
    submitReady: true,
    syncReady: true,
    cancelReady: true,
    productionReady: true,
    nextPriority: 1,
    notes: "OAuth, UBL upload, status sync, and configurable cancellation transport are in place. Romania is cleared for production when the workspace connection is validated in non-sandbox mode with ANAF credentials and cancellation endpoint configured.",
  },
  {
    country: "GR",
    displayName: "Greece",
    providerName: "myDATA",
    completionStage: "PRODUCTION_READY",
    authReady: true,
    submitReady: true,
    syncReady: true,
    cancelReady: true,
    productionReady: true,
    nextPriority: 2,
    notes: "Submission, status sync, and cancellation are wired. Greece is cleared for production when the workspace myDATA connection is validated in non-sandbox mode with AADE credentials configured.",
  },
  {
    country: "SA",
    displayName: "Saudi Arabia",
    providerName: "ZATCA",
    completionStage: "PRODUCTION_READY",
    authReady: true,
    submitReady: true,
    syncReady: true,
    cancelReady: true,
    productionReady: true,
    nextPriority: 3,
    notes: "Live submission, status sync, and cancellation are wired. Saudi Arabia is cleared for production when the workspace ZATCA connection is validated in non-sandbox mode with onboarding, signing, and operational artifacts configured.",
  },
  {
    country: "IT",
    displayName: "Italy",
    providerName: "SdI",
    completionStage: "PRODUCTION_READY",
    authReady: true,
    submitReady: true,
    syncReady: true,
    cancelReady: true,
    productionReady: true,
    nextPriority: 4,
    notes: "Live submission, status sync, and cancellation are wired. Italy is cleared for production when the workspace SdI connection is validated in non-sandbox mode with accredited routing, signing material, and endpoint configuration.",
  },
  {
    country: "MX",
    displayName: "Mexico",
    providerName: "CFDI",
    completionStage: "PRODUCTION_READY",
    authReady: true,
    submitReady: true,
    syncReady: true,
    cancelReady: true,
    productionReady: true,
    nextPriority: 5,
    notes: "Live PAC submission, status sync, and cancellation are wired. Mexico is cleared for production when the workspace CFDI connection is validated in non-sandbox mode with RFC, CSD signing material, and PAC endpoints configured.",
  },
  {
    country: "BR",
    displayName: "Brazil",
    providerName: "NF-e",
    completionStage: "PRODUCTION_READY",
    authReady: true,
    submitReady: true,
    syncReady: true,
    cancelReady: true,
    productionReady: true,
    nextPriority: 6,
    notes: "Live SEFAZ submission, status sync, and cancellation are wired. Brazil is cleared for production when the workspace NF-e connection is validated in non-sandbox mode with issuer CNPJ, UF, signing material, and transport endpoints configured.",
  },
  {
    country: "CL",
    displayName: "Chile",
    providerName: "DTE",
    completionStage: "PRODUCTION_READY",
    authReady: true,
    submitReady: true,
    syncReady: true,
    cancelReady: true,
    productionReady: true,
    nextPriority: 7,
    notes: "Live SII submission, status sync, and cancellation are wired. Chile is cleared for production when the workspace DTE connection is validated in non-sandbox mode with issuer RUT, SII credentials, signing material, and transport endpoints configured.",
  },
  {
    country: "CO",
    displayName: "Colombia",
    providerName: "DIAN",
    completionStage: "PRODUCTION_READY",
    authReady: true,
    submitReady: true,
    syncReady: true,
    cancelReady: true,
    productionReady: true,
    nextPriority: 8,
    notes: "Live DIAN submission, status sync, and cancellation are wired. Colombia is cleared for production when the workspace DIAN connection is validated in non-sandbox mode with NIT, software credentials, signing material, and transport endpoints configured.",
  },
  {
    country: "PE",
    displayName: "Peru",
    providerName: "SUNAT",
    completionStage: "PRODUCTION_READY",
    authReady: true,
    submitReady: true,
    syncReady: true,
    cancelReady: true,
    productionReady: true,
    nextPriority: 9,
    notes: "Live SUNAT submission, status sync, and cancellation are wired. Peru is cleared for production when the workspace SUNAT connection is validated in non-sandbox mode with RUC, SOL credentials, signing material, and transport endpoints configured.",
  },
  {
    country: "HU",
    displayName: "Hungary",
    providerName: "NAV Online Invoice",
    completionStage: "PRODUCTION_READY",
    authReady: true,
    submitReady: true,
    syncReady: true,
    cancelReady: true,
    productionReady: true,
    nextPriority: 10,
    notes: "Live NAV reporting, status sync, and cancellation are wired. Hungary is cleared for production when the workspace NAV connection is validated in non-sandbox mode with tax number, technical-user credentials, signing keys, and transport endpoints configured.",
  },
  {
    country: "MD",
    displayName: "Moldova",
    providerName: "e-Factura",
    completionStage: "PRODUCTION_READY",
    authReady: true,
    submitReady: true,
    syncReady: true,
    cancelReady: true,
    productionReady: true,
    nextPriority: 11,
    notes: "Live Moldova e-Factura submission, status sync, and cancellation are wired. Moldova is cleared for production when the workspace e-Factura connection is validated in non-sandbox mode with taxpayer code, SFS credentials, signing material, and transport endpoints configured.",
  },
  {
    country: "MY",
    displayName: "Malaysia",
    providerName: "MyInvois",
    completionStage: "PRODUCTION_READY",
    authReady: true,
    submitReady: true,
    syncReady: true,
    cancelReady: true,
    productionReady: true,
    nextPriority: 12,
    notes: "Live auth, submission, status sync, and cancellation are wired. Malaysia is cleared for production when the workspace MyInvois connection is validated in non-sandbox mode with client credentials and any required on-behalf-of delegation configured.",
  },
] satisfies EInvoiceRolloutItem[];

export const ALL_COUNTRY_EINVOICING_ROLLOUT = [
  ...LIMITED_COUNTRY_EINVOICING_ROLLOUT,
  ...PLANNED_COUNTRY_EINVOICING_ROLLOUT,
] satisfies EInvoiceRolloutItem[];

const ROLLOUT_BY_COUNTRY = new Map(
  ALL_COUNTRY_EINVOICING_ROLLOUT.map((item) => [item.country, item] as const)
);

export function getEInvoiceRolloutItem(country?: string | null) {
  const normalized = String(country || "").trim().toUpperCase();
  return normalized ? ROLLOUT_BY_COUNTRY.get(normalized) || null : null;
}
