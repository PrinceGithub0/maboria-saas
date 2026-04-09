import { resolveCountryComplianceModule } from "@/lib/invoicing/blueprint/registry";
import type {
  BlueprintValidationResult,
  ComplianceValidationIssue,
  ComplianceValidationLevel,
  CountryComplianceModule,
  UniversalInvoiceDocument,
} from "@/lib/invoicing/blueprint/types";
import { resolveInvoiceCompliance } from "@/lib/invoicing/resolve-compliance";
import { getWorldRegion } from "@/lib/invoicing/regions";
import type {
  InvoiceBuyerType,
  InvoiceComplianceResult,
  InvoiceSupplyType,
} from "@/lib/invoicing/types";

type BuildUniversalInvoiceDocumentInput = {
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  issueDate?: Date | string | null;
  dueDate?: Date | string | null;
  currency?: string | null;
  language?: string | null;
  supplier: {
    legalName?: string | null;
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
  customer: {
    legalName?: string | null;
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
    classification?: "BUSINESS" | "INDIVIDUAL" | "UNKNOWN" | null;
  };
  buyerType?: InvoiceBuyerType | null;
  supplyType?: InvoiceSupplyType | null;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    discountAmount?: number | null;
    taxCode?: string | null;
    taxRate?: number | null;
    taxAmount?: number | null;
    lineTotal?: number | null;
    classificationCode?: string | null;
    unitCode?: string | null;
    exemptionReason?: string | null;
  }>;
  taxBreakdown?: UniversalInvoiceDocument["taxBreakdown"];
  totals: UniversalInvoiceDocument["totals"];
  payments?: UniversalInvoiceDocument["payments"];
  deliveryModes?: UniversalInvoiceDocument["deliveryModes"];
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  complianceSnapshot?: InvoiceComplianceResult | null;
};

const normalizeText = (value?: string | null) => {
  const normalized = String(value || "").trim();
  return normalized.length ? normalized : null;
};

const normalizeIsoDate = (value?: Date | string | null) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizeCountryCode = (value?: string | null) => {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized.length ? normalized : null;
};

const buildTaxBreakdownFromLines = (
  lines: UniversalInvoiceDocument["lines"],
  taxLabel: string,
  reverseChargeApplies: boolean
): UniversalInvoiceDocument["taxBreakdown"] => {
  const hasExplicitTaxData = lines.some(
    (line) =>
      line.taxRate !== null ||
      line.taxAmount !== null ||
      Boolean(String(line.exemptionReason || "").trim())
  );
  if (!hasExplicitTaxData) {
    return [];
  }

  const grouped = new Map<
    string,
    { taxRate: number | null; taxableAmount: number; taxAmount: number; exemptionReason: Set<string> }
  >();

  lines.forEach((line) => {
    const baseAmount = Number(line.lineTotal || 0);
    const taxAmount = Number(line.taxAmount ?? 0);
    let rate: number | null = line.taxRate ?? null;

    if (rate === null && baseAmount > 0 && taxAmount > 0) {
      rate = Number(((taxAmount / baseAmount) * 100).toFixed(4));
    }

    const key = rate === null ? "unknown" : String(rate);
    const bucket = grouped.get(key) || {
      taxRate: rate,
      taxableAmount: 0,
      taxAmount: 0,
      exemptionReason: new Set<string>(),
    };
    bucket.taxableAmount += baseAmount;
    bucket.taxAmount += taxAmount;
    if (line.exemptionReason) {
      bucket.exemptionReason.add(String(line.exemptionReason));
    }
    grouped.set(key, bucket);
  });

  if (grouped.size === 0) {
    return [];
  }

  return [...grouped.values()].map((entry) => ({
    taxType: taxLabel,
    taxRate: entry.taxRate,
    taxableAmount: Number(entry.taxableAmount.toFixed(2)),
    taxAmount: Number(entry.taxAmount.toFixed(2)),
    exemptionReason: entry.exemptionReason.size
      ? [...entry.exemptionReason].join("; ")
      : null,
    reverseChargeApplies,
  }));
};

const createIssue = (
  field: string,
  code: string,
  message: string,
  severity: ComplianceValidationIssue["severity"],
  level: ComplianceValidationLevel,
  countryCode?: string | null
): ComplianceValidationIssue => ({
  field,
  code,
  message,
  severity,
  level,
  countryCode: normalizeCountryCode(countryCode),
});

function groupIssuesByLevel(issues: ComplianceValidationIssue[]) {
  return {
    GENERIC: issues.filter((issue) => issue.level === "GENERIC"),
    COUNTRY: issues.filter((issue) => issue.level === "COUNTRY"),
    EINVOICE: issues.filter((issue) => issue.level === "EINVOICE"),
  } satisfies Record<ComplianceValidationLevel, ComplianceValidationIssue[]>;
}

function hasBlockingIssues(issues: ComplianceValidationIssue[]) {
  return issues.some((issue) => issue.severity === "ERROR");
}

function buildGenericValidationIssues(document: UniversalInvoiceDocument) {
  const issues: ComplianceValidationIssue[] = [];

  if (!normalizeText(document.invoiceNumber)) {
    issues.push(createIssue("invoice.invoiceNumber", "GENERIC_INVOICE_NUMBER_REQUIRED", "Invoice number is required.", "ERROR", "GENERIC"));
  }
  if (!normalizeIsoDate(document.issueDate)) {
    issues.push(createIssue("invoice.issueDate", "GENERIC_ISSUE_DATE_REQUIRED", "Issue date is required.", "ERROR", "GENERIC"));
  }
  if (!normalizeText(document.currency)) {
    issues.push(createIssue("invoice.currency", "GENERIC_CURRENCY_REQUIRED", "Invoice currency is required.", "ERROR", "GENERIC"));
  }
  if (!normalizeText(document.supplier.legalName)) {
    issues.push(createIssue("supplier.legalName", "GENERIC_SUPPLIER_NAME_REQUIRED", "Supplier legal name is required.", "ERROR", "GENERIC"));
  }
  if (!normalizeText(document.customer.legalName)) {
    issues.push(createIssue("customer.legalName", "GENERIC_CUSTOMER_NAME_REQUIRED", "Customer legal name is required.", "ERROR", "GENERIC"));
  }
  if (!normalizeText(document.supplier.countryCode)) {
    issues.push(createIssue("supplier.countryCode", "GENERIC_SUPPLIER_COUNTRY_REQUIRED", "Supplier country is required.", "ERROR", "GENERIC"));
  }
  if (document.lines.length === 0) {
    issues.push(createIssue("invoice.lines", "GENERIC_LINE_ITEMS_REQUIRED", "At least one invoice line is required.", "ERROR", "GENERIC"));
  }

  const computedSubtotal = document.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const computedDiscount = document.lines.reduce((sum, line) => sum + (line.discountAmount || 0), 0);
  const computedTax = document.taxBreakdown.reduce((sum, item) => sum + item.taxAmount, 0);
  const expectedGrandTotal = Number((computedSubtotal - computedDiscount + computedTax).toFixed(2));
  const storedGrandTotal = Number(document.totals.grandTotal.toFixed(2));

  if (Number(document.totals.subtotal.toFixed(2)) !== Number(computedSubtotal.toFixed(2))) {
    issues.push(createIssue("invoice.totals.subtotal", "GENERIC_SUBTOTAL_MISMATCH", "Invoice subtotal does not match the sum of line items.", "ERROR", "GENERIC"));
  }
  if (Number(document.totals.discountTotal.toFixed(2)) !== Number(computedDiscount.toFixed(2))) {
    issues.push(createIssue("invoice.totals.discountTotal", "GENERIC_DISCOUNT_TOTAL_MISMATCH", "Stored discount total does not match the line-level discounts.", "WARNING", "GENERIC"));
  }
  if (Number(document.totals.taxTotal.toFixed(2)) !== Number(computedTax.toFixed(2))) {
    issues.push(createIssue("invoice.totals.taxTotal", "GENERIC_TAX_TOTAL_MISMATCH", "Stored tax total does not match the tax breakdown.", "WARNING", "GENERIC"));
  }
  if (storedGrandTotal !== expectedGrandTotal) {
    issues.push(createIssue("invoice.totals.grandTotal", "GENERIC_GRAND_TOTAL_MISMATCH", "Invoice grand total does not reconcile with subtotal, discount, and tax totals.", "ERROR", "GENERIC"));
  }

  const issueDate = normalizeIsoDate(document.issueDate);
  const dueDate = normalizeIsoDate(document.dueDate);
  if (issueDate && dueDate && new Date(dueDate).getTime() < new Date(issueDate).getTime()) {
    issues.push(createIssue("invoice.dueDate", "GENERIC_DUE_DATE_BEFORE_ISSUE_DATE", "Due date cannot be earlier than the issue date.", "ERROR", "GENERIC"));
  }

  return issues;
}

function buildEInvoicingValidationIssues(
  document: UniversalInvoiceDocument,
  countryModule: CountryComplianceModule | null
) {
  const issues: ComplianceValidationIssue[] = [];
  if (!countryModule?.supportsEInvoicing(document)) {
    return issues;
  }

  if (!document.deliveryModes.includes("xml_export")) {
    issues.push(createIssue("invoice.deliveryModes", "EINVOICE_XML_EXPORT_REQUIRED", "Electronic invoicing countries should produce an XML-capable export.", "ERROR", "EINVOICE", document.countryContext.sellerCountryCode));
  }
  if (
    !document.deliveryModes.includes("api_submission") &&
    !document.deliveryModes.includes("government_gateway_submission")
  ) {
    issues.push(createIssue("invoice.deliveryModes", "EINVOICE_DELIVERY_PATH_REQUIRED", "Electronic invoicing countries should define an API or government delivery path.", "WARNING", "EINVOICE", document.countryContext.sellerCountryCode));
  }
  if (!normalizeText(document.supplier.taxId || document.supplier.vatId)) {
    issues.push(createIssue("supplier.taxId", "EINVOICE_SUPPLIER_TAX_ID_REQUIRED", "Supplier tax registration is required for electronic invoicing.", "ERROR", "EINVOICE", document.countryContext.sellerCountryCode));
  }
  if (!normalizeText(document.supplier.addressLine1) || !normalizeText(document.supplier.postalCode)) {
    issues.push(createIssue("supplier.addressLine1", "EINVOICE_SUPPLIER_ADDRESS_INCOMPLETE", "Supplier address must include street and postal code for electronic invoicing.", "ERROR", "EINVOICE", document.countryContext.sellerCountryCode));
  }
  if (!normalizeText(document.customer.addressLine1) || !normalizeText(document.customer.countryCode)) {
    issues.push(createIssue("customer.addressLine1", "EINVOICE_CUSTOMER_ADDRESS_INCOMPLETE", "Customer address must include street and country for electronic invoicing.", "ERROR", "EINVOICE", document.countryContext.sellerCountryCode));
  }

  return issues;
}

export function buildUniversalInvoiceDocument(
  input: BuildUniversalInvoiceDocumentInput
): UniversalInvoiceDocument {
  const supplierCountryCode = normalizeCountryCode(input.supplier.countryCode);
  const customerCountryCode = normalizeCountryCode(input.customer.countryCode);
  const compliance =
    input.complianceSnapshot ||
    resolveInvoiceCompliance({
      sellerCountry: supplierCountryCode,
      buyerCountry: customerCountryCode,
      sellerTaxId: input.supplier.taxId || input.supplier.vatId,
      buyerTaxId: input.customer.taxId || input.customer.vatId,
      buyerType: input.buyerType,
      buyerCompanyName: input.customer.tradeName || input.customer.legalName,
      customerClassification:
        input.customer.classification === "BUSINESS"
          ? "BUSINESS"
          : input.customer.classification === "INDIVIDUAL"
            ? "INDIVIDUAL"
            : null,
      supplyType: input.supplyType,
      itemNames: input.lines.map((line) => line.description),
    });

  const lines = input.lines.map((line) => ({
    description: line.description,
    quantity: Number(line.quantity || 0),
    unitPrice: Number(line.unitPrice || 0),
    discountAmount: Number(line.discountAmount || 0),
    taxCode: normalizeText(line.taxCode),
    taxRate: line.taxRate ?? null,
    taxAmount: line.taxAmount ?? null,
    lineTotal:
      line.lineTotal !== undefined && line.lineTotal !== null
        ? Number(line.lineTotal)
        : Number(line.quantity || 0) * Number(line.unitPrice || 0),
    classificationCode: normalizeText(line.classificationCode),
    unitCode: normalizeText(line.unitCode),
    exemptionReason: normalizeText(line.exemptionReason),
  }));

  const taxBreakdown =
    input.taxBreakdown && input.taxBreakdown.length
      ? input.taxBreakdown
      : (() => {
          const lineDerived = buildTaxBreakdownFromLines(
            lines,
            compliance.taxLabel || "Tax",
            compliance.reverseChargeApplies
          );
          if (lineDerived.length > 0) {
            return lineDerived;
          }
          const taxableAmount =
            Number(input.totals.subtotal || 0) - Number(input.totals.discountTotal || 0);
          const taxAmount = Number(input.totals.taxTotal || 0);
          const inferredRate =
            taxableAmount > 0 && taxAmount > 0
              ? Number(((taxAmount / taxableAmount) * 100).toFixed(4))
              : null;
          return [
            {
              taxType: compliance.taxLabel || "Tax",
              taxRate: inferredRate,
              taxableAmount,
              taxAmount,
              exemptionReason: null,
              reverseChargeApplies: compliance.reverseChargeApplies,
            },
          ];
        })();

  return {
    invoiceId: normalizeText(input.invoiceId),
    invoiceNumber: normalizeText(input.invoiceNumber),
    issueDate: normalizeIsoDate(input.issueDate),
    dueDate: normalizeIsoDate(input.dueDate),
    currency: normalizeText(input.currency),
    language: normalizeText(input.language) || "en",
    buyerType: input.buyerType || compliance.buyerType || "UNKNOWN",
    supplyType: input.supplyType || compliance.supplyType || "UNKNOWN",
    countryContext: {
      sellerCountryCode: supplierCountryCode,
      buyerCountryCode: customerCountryCode,
      sellerRegion: compliance.sellerRegion || getWorldRegion(supplierCountryCode),
      buyerRegion: compliance.buyerRegion || getWorldRegion(customerCountryCode),
      supportLevel: compliance.supportLevel || "LIMITED",
      taxSystem: compliance.taxSystem || null,
    },
    supplier: {
      role: "SUPPLIER",
      classification: "BUSINESS",
      legalName: normalizeText(input.supplier.legalName),
      tradeName: normalizeText(input.supplier.tradeName),
      taxId: normalizeText(input.supplier.taxId),
      vatId: normalizeText(input.supplier.vatId),
      registrationNumber: normalizeText(input.supplier.registrationNumber),
      branchCode: normalizeText(input.supplier.branchCode),
      email: normalizeText(input.supplier.email),
      phone: normalizeText(input.supplier.phone),
      addressLine1: normalizeText(input.supplier.addressLine1),
      addressLine2: normalizeText(input.supplier.addressLine2),
      city: normalizeText(input.supplier.city),
      stateRegion: normalizeText(input.supplier.stateRegion),
      postalCode: normalizeText(input.supplier.postalCode),
      countryCode: supplierCountryCode,
    },
    customer: {
      role: "CUSTOMER",
      classification: input.customer.classification || "UNKNOWN",
      legalName: normalizeText(input.customer.legalName),
      tradeName: normalizeText(input.customer.tradeName),
      taxId: normalizeText(input.customer.taxId),
      vatId: normalizeText(input.customer.vatId),
      registrationNumber: normalizeText(input.customer.registrationNumber),
      branchCode: normalizeText(input.customer.branchCode),
      email: normalizeText(input.customer.email),
      phone: normalizeText(input.customer.phone),
      addressLine1: normalizeText(input.customer.addressLine1),
      addressLine2: normalizeText(input.customer.addressLine2),
      city: normalizeText(input.customer.city),
      stateRegion: normalizeText(input.customer.stateRegion),
      postalCode: normalizeText(input.customer.postalCode),
      countryCode: customerCountryCode,
    },
    lines,
    taxBreakdown,
    totals: {
      subtotal: Number(input.totals.subtotal || 0),
      taxTotal: Number(input.totals.taxTotal || 0),
      discountTotal: Number(input.totals.discountTotal || 0),
      grandTotal: Number(input.totals.grandTotal || 0),
    },
    payments: input.payments || [],
    deliveryModes: input.deliveryModes || ["pdf_download"],
    notes: normalizeText(input.notes),
    complianceSnapshot: compliance,
    metadata: input.metadata || null,
  };
}

export function validateUniversalInvoiceDocument(
  document: UniversalInvoiceDocument
): BlueprintValidationResult {
  const countryModule = resolveCountryComplianceModule(document.countryContext.sellerCountryCode);
  const transformedDocument = countryModule?.transform(document) || document;
  const issues = [
    ...buildGenericValidationIssues(transformedDocument),
    ...(countryModule?.validate(transformedDocument) || []),
    ...buildEInvoicingValidationIssues(transformedDocument, countryModule || null),
  ].filter((issue, index, list) => {
    const key = `${issue.level}:${issue.field}:${issue.code}:${issue.message}`;
    return list.findIndex((candidate) => {
      const candidateKey = `${candidate.level}:${candidate.field}:${candidate.code}:${candidate.message}`;
      return candidateKey === key;
    }) === index;
  });

  return {
    ok: !hasBlockingIssues(issues),
    document: transformedDocument,
    countryModule: countryModule || null,
    issues,
    byLevel: groupIssuesByLevel(issues),
  };
}
