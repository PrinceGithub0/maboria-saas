import type { EInvoiceProviderDefinition } from "@/lib/einvoicing/provider-registry";

type PlannedProviderSeed = {
  key: EInvoiceProviderDefinition["key"];
  displayName: string;
  countryCode: string;
};

type PlannedProviderOverride = Pick<
  EInvoiceProviderDefinition,
  "liveSubmissionAvailable" | "supportsStatusSync" | "completionStage" | "capabilitySummary" | "credentialFields"
>;

const plannedProviders: PlannedProviderSeed[] = [
  { key: "AE_EINVOICING", displayName: "UAE E-Invoicing", countryCode: "AE" },
  { key: "AL_FISCALIZATION", displayName: "Albania Fiscalization", countryCode: "AL" },
  { key: "AR_AFIP", displayName: "AFIP / ARCA", countryCode: "AR" },
  { key: "AZ_ETAX_INVOICE", displayName: "eTax Invoice", countryCode: "AZ" },
  { key: "BE_PEPPOL", displayName: "Peppol Belgium", countryCode: "BE" },
  { key: "BO_SIAT", displayName: "SIAT", countryCode: "BO" },
  { key: "CI_FNE", displayName: "FNE", countryCode: "CI" },
  { key: "CR_HACIENDA", displayName: "Factura Electronica", countryCode: "CR" },
  { key: "DO_DGII_ECF", displayName: "DGII e-CF", countryCode: "DO" },
  { key: "EC_SRI", displayName: "SRI Comprobantes Electronicos", countryCode: "EC" },
  { key: "EG_EINVOICE", displayName: "Egypt eInvoicing", countryCode: "EG" },
  { key: "FR_PPFE", displayName: "PPF / PDP", countryCode: "FR" },
  { key: "GH_EVAT", displayName: "eVAT", countryCode: "GH" },
  { key: "GT_FEL", displayName: "FEL", countryCode: "GT" },
  { key: "ID_EFAKTUR", displayName: "e-Faktur", countryCode: "ID" },
  { key: "IL_ISRAEL_EINVOICE", displayName: "Israel E-Invoice", countryCode: "IL" },
  { key: "JO_JOFOTARA", displayName: "JoFotara", countryCode: "JO" },
  { key: "KE_ETIMS", displayName: "eTIMS", countryCode: "KE" },
  { key: "KR_HOMETAX", displayName: "Hometax e-Tax", countryCode: "KR" },
  { key: "KZ_IS_ESF", displayName: "IS ESF", countryCode: "KZ" },
  { key: "MU_MRA_EINVOICE", displayName: "MRA e-Invoicing", countryCode: "MU" },
  { key: "MW_MRA_EIS", displayName: "MRA EIS", countryCode: "MW" },
  { key: "NG_FIRS_EFS", displayName: "FIRS E-Invoicing", countryCode: "NG" },
  { key: "OM_EINVOICING", displayName: "Oman E-Invoicing", countryCode: "OM" },
  { key: "PA_DGI", displayName: "DGI Factura Electronica", countryCode: "PA" },
  { key: "PH_EIS", displayName: "EIS", countryCode: "PH" },
  { key: "PK_FBR_DIGITAL_INVOICING", displayName: "FBR Digital Invoicing", countryCode: "PK" },
  { key: "PL_KSEF", displayName: "KSeF", countryCode: "PL" },
  { key: "PY_SIFEN", displayName: "SIFEN", countryCode: "PY" },
  { key: "RS_EFISKALIZACIJA", displayName: "eFiskalizacija", countryCode: "RS" },
  { key: "RW_EBM", displayName: "EBM", countryCode: "RW" },
  { key: "SV_DTE", displayName: "DTE", countryCode: "SV" },
  { key: "TR_EFATURA", displayName: "e-Fatura", countryCode: "TR" },
  { key: "TW_EGUI", displayName: "e-GUI", countryCode: "TW" },
  { key: "UA_EINVOICE", displayName: "Ukraine E-Invoice", countryCode: "UA" },
  { key: "UG_EFRIS", displayName: "EFRIS", countryCode: "UG" },
  { key: "UY_CFE", displayName: "CFE", countryCode: "UY" },
  { key: "VN_EINVOICE", displayName: "Vietnam E-Invoice", countryCode: "VN" },
  { key: "ZM_SMART_INVOICE", displayName: "Smart Invoice", countryCode: "ZM" },
  { key: "ZW_FDMS", displayName: "FDMS", countryCode: "ZW" },
];

const gatewayCredentialFields: EInvoiceProviderDefinition["credentialFields"] = [
  { key: "companyTaxId", label: "Company tax ID", required: true },
  { key: "apiKey", label: "API key", required: true, secret: true },
  { key: "submissionUrl", label: "Submission URL", required: true },
  { key: "statusUrl", label: "Status URL" },
  { key: "cancelUrl", label: "Cancellation URL" },
];

const plannedProviderOverrides: Partial<Record<EInvoiceProviderDefinition["key"], PlannedProviderOverride>> = {
  AE_EINVOICING: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  AL_FISCALIZATION: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  AR_AFIP: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  AZ_ETAX_INVOICE: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  BE_PEPPOL: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  BO_SIAT: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  CI_FNE: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  CR_HACIENDA: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  DO_DGII_ECF: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  EC_SRI: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  EG_EINVOICE: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  FR_PPFE: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  GH_EVAT: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  GT_FEL: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  ID_EFAKTUR: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  IL_ISRAEL_EINVOICE: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  JO_JOFOTARA: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  KE_ETIMS: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  KR_HOMETAX: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  KZ_IS_ESF: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  MU_MRA_EINVOICE: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  MW_MRA_EIS: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  NG_FIRS_EFS: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  OM_EINVOICING: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  PA_DGI: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  PH_EIS: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  PK_FBR_DIGITAL_INVOICING: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  PL_KSEF: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  PY_SIFEN: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  RS_EFISKALIZACIJA: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  RW_EBM: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  SV_DTE: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  TR_EFATURA: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  TW_EGUI: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  UA_EINVOICE: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  UG_EFRIS: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  UY_CFE: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  VN_EINVOICE: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  ZM_SMART_INVOICE: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
  ZW_FDMS: {
    liveSubmissionAvailable: true,
    supportsStatusSync: true,
    completionStage: "CANCEL_READY",
    capabilitySummary:
      "Accredited gateway submission, status sync, and cancellation transport are wired. Country-specific certification and production signoff still need completion before launch.",
    credentialFields: gatewayCredentialFields,
  },
};

export const plannedProviderEntries = plannedProviders.map(
  (provider) => {
    const override = plannedProviderOverrides[provider.key];
    return (
    [
      provider.key,
      {
        key: provider.key,
        displayName: provider.displayName,
        countryCodes: [provider.countryCode],
        liveSubmissionAvailable: override?.liveSubmissionAvailable ?? false,
        supportsStatusSync: override?.supportsStatusSync ?? false,
        completionStage: override?.completionStage ?? "SCHEMA_ONLY",
        capabilitySummary:
          override?.capabilitySummary ||
          "Country-specific transport is registered in the implementation queue, but live submission is not implemented yet.",
        credentialFields: override?.credentialFields ?? [],
      },
    ] as [EInvoiceProviderDefinition["key"], EInvoiceProviderDefinition]
    );
  }
);
