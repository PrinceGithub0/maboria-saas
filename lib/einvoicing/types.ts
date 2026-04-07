import type { InvoiceComplianceResult } from "@/lib/invoicing/types";

export type EInvoiceProviderKey =
  | "MYINVOIS"
  | "RO_EFACTURA"
  | "MYDATA"
  | "ZATCA"
  | "IT_SDI"
  | "MX_CFDI"
  | "BR_NFE"
  | "CL_DTE"
  | "CO_DIAN"
  | "PE_SUNAT"
  | "HU_NAV"
  | "MD_EFACTURA"
  | "AE_EINVOICING"
  | "AL_FISCALIZATION"
  | "AR_AFIP"
  | "AZ_ETAX_INVOICE"
  | "BE_PEPPOL"
  | "BO_SIAT"
  | "CI_FNE"
  | "CR_HACIENDA"
  | "DO_DGII_ECF"
  | "EC_SRI"
  | "EG_EINVOICE"
  | "FR_PPFE"
  | "GH_EVAT"
  | "GT_FEL"
  | "ID_EFAKTUR"
  | "IL_ISRAEL_EINVOICE"
  | "JO_JOFOTARA"
  | "KE_ETIMS"
  | "KR_HOMETAX"
  | "KZ_IS_ESF"
  | "MU_MRA_EINVOICE"
  | "MW_MRA_EIS"
  | "NG_FIRS_EFS"
  | "OM_EINVOICING"
  | "PA_DGI"
  | "PH_EIS"
  | "PK_FBR_DIGITAL_INVOICING"
  | "PL_KSEF"
  | "PY_SIFEN"
  | "RS_EFISKALIZACIJA"
  | "RW_EBM"
  | "SV_DTE"
  | "TR_EFATURA"
  | "TW_EGUI"
  | "UA_EINVOICE"
  | "UG_EFRIS"
  | "UY_CFE"
  | "VN_EINVOICE"
  | "ZM_SMART_INVOICE"
  | "ZW_FDMS";
export type EInvoiceConnectionStatus = "ACTIVE" | "DISABLED" | "ERROR";
export type EInvoiceCompletionStage =
  | "SCHEMA_ONLY"
  | "AUTH_READY"
  | "SUBMIT_READY"
  | "SYNC_READY"
  | "CANCEL_READY"
  | "PRODUCTION_READY";

export type EInvoiceDocumentFormat = "JSON" | "UBL_JSON" | "UBL_XML" | "REPORTING";

export type EInvoiceRequirement = "NOT_REQUIRED" | "OPTIONAL" | "REQUIRED";

export type EInvoiceStatus =
  | "NOT_REQUIRED"
  | "NOT_CONFIGURED"
  | "READY"
  | "VALIDATION_FAILED"
  | "QUEUED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED";

export type EInvoiceProviderContext = {
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  sellerCountry?: string | null;
  buyerCountry?: string | null;
  currency?: string | null;
  issuedAt?: string | null;
  dueDate?: string | null;
  compliance?: Partial<InvoiceComplianceResult> | null;
  business?: EInvoicePartyDetails | null;
  customer?: EInvoicePartyDetails | null;
  items?: EInvoiceLineInput[];
  totals?: EInvoiceTotalsInput | null;
  transportDocument?: EInvoiceTransportDocument | null;
  connection?: EInvoiceConnectionConfig | null;
};

export type EInvoiceConnectionConfig = {
  id?: string | null;
  provider?: EInvoiceProviderKey | null;
  country?: string | null;
  status?: EInvoiceConnectionStatus | null;
  sandbox?: boolean | null;
  hasCredentials?: boolean | null;
  credentials?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  lastValidatedAt?: string | null;
  lastError?: string | null;
};

export type EInvoicePartyDetails = {
  legalName?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  branchCode?: string | null;
  sstRegistrationNumber?: string | null;
  country?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

export type EInvoiceLineInput = {
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal?: number | null;
  taxAmount?: number | null;
  unitCode?: string | null;
  classificationCode?: string | null;
  taxCategory?: string | null;
  taxExemptionReason?: string | null;
  incomeClassification?: string | null;
};

export type EInvoiceTotalsInput = {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
};

export type EInvoiceTransportDocument = {
  format?: "XML" | "UBL_XML" | "JSON" | null;
  documentBase64?: string | null;
  invoiceHash?: string | null;
  uuid?: string | null;
  digest?: string | null;
  mode?: "CLEARANCE" | "REPORTING" | null;
};

export type EInvoicePayloadBuildResult = {
  externalId: string;
  format: EInvoiceDocumentFormat;
  payload: Record<string, unknown>;
  warnings: string[];
};

export type EInvoiceValidationResult =
  | { ok: true; warnings?: string[] }
  | { ok: false; errors: string[]; warnings?: string[] };

export type EInvoiceSubmissionResult = {
  status: Extract<EInvoiceStatus, "QUEUED" | "SUBMITTED" | "ACCEPTED">;
  submissionId: string;
  providerReference?: string | null;
  rawResponse?: Record<string, unknown> | null;
};

export type EInvoiceStatusResult = {
  status: Extract<EInvoiceStatus, "QUEUED" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "CANCELLED">;
  providerReference?: string | null;
  rawResponse?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

export type EInvoiceCancellationResult = {
  status: Extract<EInvoiceStatus, "CANCELLED">;
  rawResponse?: Record<string, unknown> | null;
};

export type InvoiceEInvoicingSnapshot = {
  country: string | null;
  providerKey: EInvoiceProviderKey | null;
  documentFormat: EInvoiceDocumentFormat | null;
  requirement: EInvoiceRequirement;
  status: EInvoiceStatus;
  supportsClearance: boolean;
  statusSyncAvailable: boolean;
  cancellationAvailable: boolean;
  productionReady: boolean;
  transportDocumentAttached: boolean;
  transportDocumentFormat: EInvoiceTransportDocument["format"] | null;
  transportUuid: string | null;
  transportHashPresent: boolean;
  submissionId: string | null;
  providerReference: string | null;
  submittedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  payloadHash: string | null;
  warnings: string[];
  productionBlockers: string[];
  note: string | null;
};

export type EInvoiceProviderAdapter = {
  key: EInvoiceProviderKey;
  countries: readonly string[];
  documentFormat: EInvoiceDocumentFormat;
  supportsClearance: boolean;
  buildPayload: (context: EInvoiceProviderContext) => Promise<EInvoicePayloadBuildResult> | EInvoicePayloadBuildResult;
  validatePayload: (payload: EInvoicePayloadBuildResult, context: EInvoiceProviderContext) => Promise<EInvoiceValidationResult> | EInvoiceValidationResult;
  buildWarnings?: (context: EInvoiceProviderContext) => string[];
  submit?: (
    payload: EInvoicePayloadBuildResult,
    context: EInvoiceProviderContext
  ) => Promise<EInvoiceSubmissionResult>;
  getStatus?: (
    submissionId: string,
    context: EInvoiceProviderContext
  ) => Promise<EInvoiceStatusResult>;
  cancel?: (
    submissionId: string,
    context: EInvoiceProviderContext
  ) => Promise<EInvoiceCancellationResult>;
};
