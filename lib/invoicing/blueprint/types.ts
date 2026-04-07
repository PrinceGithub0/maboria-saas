import type {
  InvoiceBuyerType,
  InvoiceComplianceResult,
  InvoiceSupplyType,
  SupportLevel,
  TaxSystem,
  WorldRegion,
} from "@/lib/invoicing/types";

export type ComplianceValidationLevel = "GENERIC" | "COUNTRY" | "EINVOICE";

export type ComplianceValidationSeverity = "ERROR" | "WARNING" | "INFO";

export type InvoiceDeliveryMode =
  | "pdf_download"
  | "email_delivery"
  | "xml_export"
  | "api_submission"
  | "peppol_delivery"
  | "government_gateway_submission";

export type InvoiceExportFormat = "PDF" | "HTML" | "JSON" | "XML" | "UBL_XML";

export type UniversalInvoiceParty = {
  role: "SUPPLIER" | "CUSTOMER";
  classification: "BUSINESS" | "INDIVIDUAL" | "UNKNOWN";
  legalName: string | null;
  tradeName?: string | null;
  taxId?: string | null;
  vatId?: string | null;
  registrationNumber?: string | null;
  branchCode?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
};

export type UniversalInvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxCode?: string | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  lineTotal: number;
  classificationCode?: string | null;
  unitCode?: string | null;
  exemptionReason?: string | null;
};

export type UniversalInvoiceTaxBreakdown = {
  taxType: string;
  taxRate?: number | null;
  taxableAmount: number;
  taxAmount: number;
  exemptionReason?: string | null;
  reverseChargeApplies?: boolean;
};

export type UniversalInvoicePaymentRecord = {
  provider?: string | null;
  externalPaymentId?: string | null;
  amount: number;
  currency: string;
  paidAt?: string | null;
  status?: string | null;
};

export type UniversalInvoiceDocument = {
  invoiceId?: string | null;
  invoiceNumber: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  currency: string | null;
  language?: string | null;
  buyerType: InvoiceBuyerType;
  supplyType: InvoiceSupplyType;
  countryContext: {
    sellerCountryCode: string | null;
    buyerCountryCode: string | null;
    sellerRegion: WorldRegion | null;
    buyerRegion: WorldRegion | null;
    supportLevel: SupportLevel;
    taxSystem: TaxSystem | null;
  };
  supplier: UniversalInvoiceParty;
  customer: UniversalInvoiceParty;
  lines: UniversalInvoiceLine[];
  taxBreakdown: UniversalInvoiceTaxBreakdown[];
  totals: {
    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    grandTotal: number;
  };
  payments: UniversalInvoicePaymentRecord[];
  deliveryModes: InvoiceDeliveryMode[];
  notes?: string | null;
  complianceSnapshot?: InvoiceComplianceResult | null;
  metadata?: Record<string, unknown> | null;
};

export type ComplianceValidationIssue = {
  field: string;
  code: string;
  message: string;
  severity: ComplianceValidationSeverity;
  level: ComplianceValidationLevel;
  countryCode?: string | null;
};

export type ComplianceRuleEvidence = {
  label: string;
  url?: string | null;
  reviewedAt?: string | null;
};

export type CountryComplianceModule = {
  countryCode: string;
  implementationType: "DEFAULT" | "SPECIALIZED";
  region: WorldRegion | null;
  supportLevel: SupportLevel;
  taxSystem: TaxSystem | null;
  taxLabel: string;
  ruleVersion?: string | null;
  evidence?: ComplianceRuleEvidence[];
  requiredFields: (document: UniversalInvoiceDocument) => string[];
  validate: (document: UniversalInvoiceDocument) => ComplianceValidationIssue[];
  transform: (document: UniversalInvoiceDocument) => UniversalInvoiceDocument;
  exportFormats: (document: UniversalInvoiceDocument) => InvoiceExportFormat[];
  supportsEInvoicing: (document: UniversalInvoiceDocument) => boolean;
};

export type BlueprintValidationResult = {
  ok: boolean;
  document: UniversalInvoiceDocument;
  countryModule: CountryComplianceModule | null;
  issues: ComplianceValidationIssue[];
  byLevel: Record<ComplianceValidationLevel, ComplianceValidationIssue[]>;
};
