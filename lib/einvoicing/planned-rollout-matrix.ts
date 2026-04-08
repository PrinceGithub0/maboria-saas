import type { EInvoiceRolloutItem } from "@/lib/einvoicing/rollout-matrix";

type PlannedRolloutSeed = {
  country: string;
  displayName: string;
  providerName: string;
};

const plannedRolloutSeeds: PlannedRolloutSeed[] = [
  { country: "AE", displayName: "United Arab Emirates", providerName: "UAE E-Invoicing" },
  { country: "AL", displayName: "Albania", providerName: "Albania Fiscalization" },
  { country: "AR", displayName: "Argentina", providerName: "AFIP / ARCA" },
  { country: "AZ", displayName: "Azerbaijan", providerName: "eTax Invoice" },
  { country: "BE", displayName: "Belgium", providerName: "Peppol Belgium" },
  { country: "BO", displayName: "Bolivia", providerName: "SIAT" },
  { country: "CI", displayName: "Cote d'Ivoire", providerName: "FNE" },
  { country: "CR", displayName: "Costa Rica", providerName: "Factura Electronica" },
  { country: "DO", displayName: "Dominican Republic", providerName: "DGII e-CF" },
  { country: "EC", displayName: "Ecuador", providerName: "SRI Comprobantes Electronicos" },
  { country: "EG", displayName: "Egypt", providerName: "Egypt eInvoicing" },
  { country: "FR", displayName: "France", providerName: "PPF / PDP" },
  { country: "GH", displayName: "Ghana", providerName: "eVAT" },
  { country: "GT", displayName: "Guatemala", providerName: "FEL" },
  { country: "ID", displayName: "Indonesia", providerName: "e-Faktur" },
  { country: "IL", displayName: "Israel", providerName: "Israel E-Invoice" },
  { country: "JO", displayName: "Jordan", providerName: "JoFotara" },
  { country: "KE", displayName: "Kenya", providerName: "eTIMS" },
  { country: "KR", displayName: "South Korea", providerName: "Hometax e-Tax" },
  { country: "KZ", displayName: "Kazakhstan", providerName: "IS ESF" },
  { country: "MU", displayName: "Mauritius", providerName: "MRA e-Invoicing" },
  { country: "MW", displayName: "Malawi", providerName: "MRA EIS" },
  { country: "NG", displayName: "Nigeria", providerName: "FIRS E-Invoicing" },
  { country: "OM", displayName: "Oman", providerName: "Oman E-Invoicing" },
  { country: "PA", displayName: "Panama", providerName: "DGI Factura Electronica" },
  { country: "PH", displayName: "Philippines", providerName: "EIS" },
  { country: "PK", displayName: "Pakistan", providerName: "FBR Digital Invoicing" },
  { country: "PL", displayName: "Poland", providerName: "KSeF" },
  { country: "PY", displayName: "Paraguay", providerName: "SIFEN" },
  { country: "RS", displayName: "Serbia", providerName: "eFiskalizacija" },
  { country: "RW", displayName: "Rwanda", providerName: "EBM" },
  { country: "SV", displayName: "El Salvador", providerName: "DTE" },
  { country: "TR", displayName: "Turkiye", providerName: "e-Fatura" },
  { country: "TW", displayName: "Taiwan", providerName: "e-GUI" },
  { country: "UA", displayName: "Ukraine", providerName: "Ukraine E-Invoice" },
  { country: "UG", displayName: "Uganda", providerName: "EFRIS" },
  { country: "UY", displayName: "Uruguay", providerName: "CFE" },
  { country: "VN", displayName: "Vietnam", providerName: "Vietnam E-Invoice" },
  { country: "ZM", displayName: "Zambia", providerName: "Smart Invoice" },
  { country: "ZW", displayName: "Zimbabwe", providerName: "FDMS" },
];

const transportReadyCountries = new Set([
  "AE",
  "AL",
  "AR",
  "AZ",
  "BE",
  "BO",
  "CI",
  "CR",
  "DO",
  "EC",
  "EG",
  "FR",
  "GH",
  "GT",
  "ID",
  "IL",
  "JO",
  "KE",
  "KR",
  "KZ",
  "MU",
  "MW",
  "NG",
  "OM",
  "PA",
  "PH",
  "PK",
  "PL",
  "PY",
  "RS",
  "RW",
  "SV",
  "TR",
  "TW",
  "UA",
  "UG",
  "UY",
  "VN",
  "ZM",
  "ZW",
]);

export const PLANNED_COUNTRY_EINVOICING_ROLLOUT = plannedRolloutSeeds.map(
  (item, index) => {
    const transportReady = transportReadyCountries.has(item.country);
    return (
    ({
      ...item,
      completionStage: transportReady ? "CANCEL_READY" : "SCHEMA_ONLY",
      authReady: transportReady,
      submitReady: transportReady,
      syncReady: transportReady,
      cancelReady: transportReady,
      productionReady: false,
      nextPriority: index + 13,
      notes: transportReady
        ? "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification, legal signoff, and production validation still need to be completed."
        : "Country-specific blueprint rules are present, and the transport has been registered in the implementation queue. Provider adapter, certification, and production validation still need to be built.",
    }) satisfies EInvoiceRolloutItem
    );
  }
);
