import { getCountryName } from "@/lib/countries";
import type { InvoiceComplianceResult } from "@/lib/invoicing/types";

const formatCountry = (country?: string | null) => {
  const normalized = String(country || "").trim().toUpperCase();
  if (!normalized) return "";
  return normalized.length === 2 ? getCountryName(normalized, "en") : normalized;
};

const getTaxIdLabel = (taxLabel?: string | null) => {
  const normalized = String(taxLabel || "").trim();
  if (!normalized) return "tax ID";
  if (normalized === "VAT") return "VAT ID";
  if (normalized === "GST") return "GST registration number";
  if (normalized === "GST/HST") return "GST/HST registration number";
  if (normalized === "Sales Tax") return "sales tax registration number";
  if (normalized === "VAT/IVA") return "VAT/IVA registration number";
  return `${normalized} registration number`;
};

const hasWarning = (
  compliance: Pick<InvoiceComplianceResult, "warnings"> | Partial<InvoiceComplianceResult> | null | undefined,
  code: InvoiceComplianceResult["warnings"][number]["code"]
) => Boolean(compliance?.warnings?.some((warning) => warning.code === code));

export function getComplianceSendBlockingReason(
  compliance: InvoiceComplianceResult
): string | null {
  if (
    compliance.buyerType === "B2B" &&
    compliance.requiresBuyerTaxId &&
    hasWarning(compliance, "buyer_tax_id_recommended")
  ) {
    return `Customer ${getTaxIdLabel(compliance.taxLabel)} is required before sending this B2B invoice.`;
  }
  if (compliance.requiresSellerTaxId && hasWarning(compliance, "seller_tax_id_recommended")) {
    return `Business ${getTaxIdLabel(compliance.taxLabel)} is required before sending this invoice.`;
  }
  if (!compliance.buyerCountry && hasWarning(compliance, "buyer_country_missing")) {
    return "Customer country is required before sending this invoice.";
  }
  return null;
}

export function getComplianceInvoiceNote(
  compliance?: Partial<InvoiceComplianceResult> | null
): string | null {
  if (!compliance) return null;

  const sellerCountry = String(compliance.sellerCountry || "").trim().toUpperCase();
  const sellerCountryName = formatCountry(sellerCountry);
  const buyerCountryName = formatCountry(compliance.buyerCountry);
  const noteKey = String(compliance.suggestedNoteKey || "").trim();
  const taxLabel = String(compliance.taxLabel || "Tax").trim() || "Tax";
  const lowerTaxLabel = taxLabel.toLowerCase();

  if (noteKey === "reverse_charge" || compliance.taxTreatment === "REVERSE_CHARGE") {
    if (taxLabel === "VAT") {
      return "VAT reverse charge applies. Customer to account for VAT under the applicable cross-border B2B rules.";
    }
    return `Reverse charge may apply. Customer to account for ${lowerTaxLabel} where required.`;
  }

  if (noteKey === "country_requires_e_invoicing" || compliance.requiresEInvoicing) {
    if (sellerCountry === "SA") {
      return "Saudi Arabia may require ZATCA-compliant e-invoicing and clearance in addition to this PDF invoice.";
    }
    if (sellerCountry === "IT") {
      return "Italy may require SdI electronic invoicing in addition to this PDF invoice.";
    }
    if (sellerCountry === "GR") {
      return "Greece may require myDATA electronic reporting or e-invoicing in addition to this PDF invoice.";
    }
    if (sellerCountry === "HU") {
      return "Hungary may require online invoice reporting or other local electronic reporting in addition to this PDF invoice.";
    }
    if (sellerCountry === "MD") {
      return "Moldova may require e-Factura or other electronic fiscal workflows in addition to this PDF invoice.";
    }
    if (sellerCountry === "MX") {
      return "Mexico may require CFDI-compliant electronic invoicing in addition to this PDF invoice.";
    }
    if (sellerCountry === "MY") {
      return "Malaysia may require MyInvois electronic invoicing in addition to this PDF invoice.";
    }
    if (sellerCountry === "BR") {
      return "Brazil may require locally cleared electronic invoicing in addition to this PDF invoice.";
    }
    if (sellerCountry === "CL") {
      return "Chile may require locally cleared electronic invoicing in addition to this PDF invoice.";
    }
    if (sellerCountry === "CO") {
      return "Colombia may require DIAN electronic invoicing in addition to this PDF invoice.";
    }
    if (sellerCountry === "PE") {
      return "Peru may require SUNAT electronic invoicing in addition to this PDF invoice.";
    }
    if (sellerCountry === "RO") {
      return "Romania may require RO e-Factura electronic invoicing in addition to this PDF invoice.";
    }
    if (sellerCountryName) {
      return `${sellerCountryName} may require local e-invoicing or government clearance in addition to this PDF invoice.`;
    }
    return "Local e-invoicing or government clearance may be required in addition to this PDF invoice.";
  }

  if (noteKey === "cross_border_manual_review" || compliance.taxTreatment === "MANUAL_REVIEW") {
    if (sellerCountryName && buyerCountryName) {
      return `Cross-border invoicing between ${sellerCountryName} and ${buyerCountryName} should be reviewed for local tax treatment before final issuance.`;
    }
    return "Cross-border tax treatment should be reviewed before final issuance.";
  }

  if (noteKey === "seller_tax_id_recommended") {
    return `Seller ${getTaxIdLabel(taxLabel)} should be completed before final issuance.`;
  }

  if (compliance.supportLevel === "LIMITED" || hasWarning(compliance, "country_limited_support")) {
    if (sellerCountryName) {
      return `${sellerCountryName} currently has limited local invoice compliance support. Manual review is recommended before final issuance.`;
    }
    return "This country currently has limited local invoice compliance support. Manual review is recommended before final issuance.";
  }

  return null;
}
