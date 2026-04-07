import { getCountryInvoiceRule } from "@/lib/invoicing/country-rules";
import type {
  InvoiceBuyerType,
  InvoiceComplianceInput,
  InvoiceComplianceResult,
  InvoiceComplianceWarning,
  InvoiceSupplyType,
  SupportLevel,
} from "@/lib/invoicing/types";

const SAAS_PATTERN = /\b(plan|subscription|saas|license|seat|workspace|annual|monthly|yearly)\b/i;
const GOODS_PATTERN = /\b(shipping|weight|sku|quantity|unit|product|goods|item)\b/i;

const uniqueWarnings = (warnings: InvoiceComplianceWarning[]) => {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const pushWarning = (
  warnings: InvoiceComplianceWarning[],
  warning: InvoiceComplianceWarning
) => warnings.push(warning);

function inferBuyerType(input: InvoiceComplianceInput, warnings: InvoiceComplianceWarning[]) {
  if (input.buyerType === "B2B" || input.buyerType === "B2C") return input.buyerType;
  if (String(input.buyerTaxId || "").trim()) {
    pushWarning(warnings, {
      code: "buyer_type_inferred",
      message: "Buyer type was inferred as B2B from the customer tax ID.",
    });
    return "B2B" as InvoiceBuyerType;
  }
  if (
    input.customerClassification === "BUSINESS" ||
    Boolean(String(input.buyerCompanyName || "").trim())
  ) {
    pushWarning(warnings, {
      code: "buyer_type_inferred",
      message: "Buyer type was inferred as B2B from the customer company details.",
    });
    return "B2B" as InvoiceBuyerType;
  }
  if (input.buyerCountry) {
    pushWarning(warnings, {
      code: "buyer_type_inferred",
      message: "Buyer type was inferred as B2C because no explicit business buyer fields were supplied.",
    });
    return "B2C" as InvoiceBuyerType;
  }
  return "UNKNOWN" as InvoiceBuyerType;
}

function inferSupplyType(input: InvoiceComplianceInput, warnings: InvoiceComplianceWarning[]) {
  if (input.supplyType === "SAAS" || input.supplyType === "SERVICES" || input.supplyType === "GOODS") {
    return input.supplyType;
  }
  const haystack = (input.itemNames || []).join(" ").trim();
  if (!haystack) return "UNKNOWN" as InvoiceSupplyType;
  if (SAAS_PATTERN.test(haystack)) {
    pushWarning(warnings, {
      code: "supply_type_inferred",
      message: "Supply type was inferred as SaaS from the invoice line items.",
    });
    return "SAAS" as InvoiceSupplyType;
  }
  if (GOODS_PATTERN.test(haystack)) {
    pushWarning(warnings, {
      code: "supply_type_inferred",
      message: "Supply type was inferred as goods from the invoice line items.",
    });
    return "GOODS" as InvoiceSupplyType;
  }
  pushWarning(warnings, {
    code: "supply_type_inferred",
    message: "Supply type defaulted to services because the invoice does not classify the supply explicitly.",
  });
  return "SERVICES" as InvoiceSupplyType;
}

const rankSupportLevel = (value: SupportLevel) => {
  if (value === "LIMITED") return 3;
  if (value === "STANDARD") return 2;
  return 1;
};

export function resolveInvoiceCompliance(input: InvoiceComplianceInput): InvoiceComplianceResult {
  const warnings: InvoiceComplianceWarning[] = [];
  const sellerCountry = String(input.sellerCountry || "").trim().toUpperCase() || null;
  const buyerCountry = String(input.buyerCountry || "").trim().toUpperCase() || null;
  const sellerRule = getCountryInvoiceRule(sellerCountry);
  const buyerRule = getCountryInvoiceRule(buyerCountry);

  if (!sellerCountry) {
    pushWarning(warnings, {
      code: "seller_country_missing",
      message: "Seller country is required to resolve invoice compliance reliably.",
    });
  }
  if (!buyerCountry) {
    pushWarning(warnings, {
      code: "buyer_country_missing",
      message: "Buyer country is missing, so cross-border tax treatment may require manual review.",
    });
  }

  const buyerType = inferBuyerType(input, warnings);
  const supplyType = inferSupplyType(input, warnings);
  const isDomestic =
    sellerCountry && buyerCountry ? sellerCountry === buyerCountry : null;
  const isCrossBorder = isDomestic === null ? null : !isDomestic;

  let supportLevel: SupportLevel = "STANDARD";
  if (sellerRule) supportLevel = sellerRule.supportLevel;
  if (buyerRule && rankSupportLevel(buyerRule.supportLevel) > rankSupportLevel(supportLevel)) {
    supportLevel = buyerRule.supportLevel;
  }
  if (!sellerRule) supportLevel = "LIMITED";

  const taxSystem = sellerRule?.taxSystem || null;
  const taxLabel = sellerRule?.taxLabel || "Tax";
  const requiresBuyerTaxId =
    Boolean(sellerRule?.requiresBuyerTaxIdForB2B) && buyerType === "B2B";
  const requiresSellerTaxId = Boolean(sellerRule?.requiresSellerTaxId);
  const reverseChargeApplies =
    Boolean(sellerRule?.allowsReverseCharge) &&
    isCrossBorder === true &&
    buyerType === "B2B" &&
    Boolean(String(input.buyerTaxId || "").trim()) &&
    (supplyType === "SAAS" || supplyType === "SERVICES") &&
    taxSystem === "VAT";

  if (supportLevel === "LIMITED") {
    pushWarning(warnings, {
      code: "country_limited_support",
      message: "This seller or buyer country currently has limited local invoice compliance support.",
    });
  }
  if (sellerRule?.requiresEInvoicing) {
    pushWarning(warnings, {
      code: "country_requires_e_invoicing",
      message: "This country may require local e-invoicing or clearance flows outside the standard PDF invoice.",
    });
  }
  if (requiresSellerTaxId && !String(input.sellerTaxId || "").trim()) {
    pushWarning(warnings, {
      code: "seller_tax_id_recommended",
      message: "Seller tax registration details should be captured for this country before sending invoices.",
    });
  }
  if (requiresBuyerTaxId && !String(input.buyerTaxId || "").trim()) {
    pushWarning(warnings, {
      code: "buyer_tax_id_recommended",
      message: "Buyer tax ID is recommended for B2B invoicing in this country setup.",
    });
  }

  let taxTreatment: InvoiceComplianceResult["taxTreatment"] = "STANDARD_TAX";
  let suggestedNoteKey: InvoiceComplianceResult["suggestedNoteKey"] = null;

  if (reverseChargeApplies) {
    taxTreatment = "REVERSE_CHARGE";
    suggestedNoteKey = "reverse_charge";
  } else if (isCrossBorder === true) {
    taxTreatment = "MANUAL_REVIEW";
    suggestedNoteKey = sellerRule?.requiresEInvoicing
      ? "country_requires_e_invoicing"
      : "cross_border_manual_review";
    pushWarning(warnings, {
      code: "cross_border_manual_review",
      message: "Cross-border invoicing rules vary by country and should be reviewed before final issuance.",
    });
  } else if (sellerRule?.requiresEInvoicing) {
    suggestedNoteKey = "country_requires_e_invoicing";
  } else if (requiresSellerTaxId && !String(input.sellerTaxId || "").trim()) {
    suggestedNoteKey = "seller_tax_id_recommended";
  }

  return {
    sellerCountry,
    buyerCountry,
    sellerRegion: sellerRule?.region || null,
    buyerRegion: buyerRule?.region || null,
    buyerType,
    supplyType,
    supportLevel,
    taxSystem,
    taxLabel,
    taxTreatment,
    reverseChargeApplies,
    requiresBuyerTaxId,
    requiresSellerTaxId,
    requiresEInvoicing: Boolean(sellerRule?.requiresEInvoicing),
    isDomestic,
    isCrossBorder,
    warnings: uniqueWarnings(warnings),
    suggestedNoteKey,
  };
}
