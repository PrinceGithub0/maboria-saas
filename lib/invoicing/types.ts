export type WorldRegion =
  | "NORTH_AMERICA"
  | "SOUTH_AMERICA"
  | "EUROPE"
  | "AFRICA"
  | "ASIA"
  | "OCEANIA";

export type SupportLevel = "ADVANCED" | "STANDARD" | "LIMITED";

export type TaxSystem = "VAT" | "GST" | "SALES_TAX" | "MIXED";

export type InvoiceBuyerType = "B2B" | "B2C" | "UNKNOWN";

export type InvoiceSupplyType = "SAAS" | "SERVICES" | "GOODS" | "UNKNOWN";

export type TaxTreatment =
  | "STANDARD_TAX"
  | "REVERSE_CHARGE"
  | "ZERO_RATED"
  | "EXEMPT"
  | "OUT_OF_SCOPE"
  | "MANUAL_REVIEW";

export type ComplianceWarningCode =
  | "seller_country_missing"
  | "buyer_country_missing"
  | "buyer_type_inferred"
  | "supply_type_inferred"
  | "buyer_tax_id_recommended"
  | "seller_tax_id_recommended"
  | "cross_border_manual_review"
  | "country_limited_support"
  | "country_requires_e_invoicing";

export type SuggestedNoteKey =
  | "reverse_charge"
  | "cross_border_manual_review"
  | "country_requires_e_invoicing"
  | "seller_tax_id_recommended"
  | null;

export type CountryInvoiceRule = {
  country: string;
  region: WorldRegion;
  supportLevel: SupportLevel;
  taxSystem: TaxSystem;
  taxLabel: string;
  requiresSellerTaxId: boolean;
  requiresBuyerTaxIdForB2B: boolean;
  allowsReverseCharge: boolean;
  requiresEInvoicing: boolean;
  requiresLocalWarnings: boolean;
};

export type InvoiceComplianceWarning = {
  code: ComplianceWarningCode;
  message: string;
};

export type InvoiceComplianceInput = {
  sellerCountry?: string | null;
  buyerCountry?: string | null;
  sellerTaxId?: string | null;
  buyerTaxId?: string | null;
  buyerType?: InvoiceBuyerType | null;
  buyerCompanyName?: string | null;
  customerClassification?: "INDIVIDUAL" | "BUSINESS" | null;
  supplyType?: InvoiceSupplyType | null;
  itemNames?: string[];
};

export type InvoiceComplianceResult = {
  sellerCountry: string | null;
  buyerCountry: string | null;
  sellerRegion: WorldRegion | null;
  buyerRegion: WorldRegion | null;
  buyerType: InvoiceBuyerType;
  supplyType: InvoiceSupplyType;
  supportLevel: SupportLevel;
  taxSystem: TaxSystem | null;
  taxLabel: string;
  taxTreatment: TaxTreatment;
  reverseChargeApplies: boolean;
  requiresBuyerTaxId: boolean;
  requiresSellerTaxId: boolean;
  requiresEInvoicing: boolean;
  isDomestic: boolean | null;
  isCrossBorder: boolean | null;
  warnings: InvoiceComplianceWarning[];
  suggestedNoteKey: SuggestedNoteKey;
};
