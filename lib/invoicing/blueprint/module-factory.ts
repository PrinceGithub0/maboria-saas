import { getEInvoiceProviderDefinition } from "@/lib/einvoicing/provider-registry";
import { resolveEInvoiceProvider } from "@/lib/einvoicing/resolve-provider";
import { getCountryInvoiceRule } from "@/lib/invoicing/country-rules";
import { resolveInvoiceCompliance } from "@/lib/invoicing/resolve-compliance";
import type {
  ComplianceRuleEvidence,
  ComplianceValidationIssue,
  CountryComplianceModule,
  InvoiceExportFormat,
  UniversalInvoiceDocument,
} from "@/lib/invoicing/blueprint/types";

type CountryModuleHooks = {
  implementationType?: CountryComplianceModule["implementationType"];
  ruleVersion?: string | null;
  evidence?: ComplianceRuleEvidence[];
  extendRequiredFields?: (
    fields: string[],
    document: UniversalInvoiceDocument,
    baseRule: ReturnType<typeof getCountryInvoiceRule>
  ) => string[];
  extendValidation?: (
    issues: ComplianceValidationIssue[],
    document: UniversalInvoiceDocument,
    baseRule: ReturnType<typeof getCountryInvoiceRule>
  ) => ComplianceValidationIssue[];
  extendTransform?: (
    document: UniversalInvoiceDocument,
    baseRule: ReturnType<typeof getCountryInvoiceRule>
  ) => UniversalInvoiceDocument;
  extendExportFormats?: (
    formats: InvoiceExportFormat[],
    document: UniversalInvoiceDocument,
    baseRule: ReturnType<typeof getCountryInvoiceRule>
  ) => InvoiceExportFormat[];
  overrideSupportsEInvoicing?: (
    document: UniversalInvoiceDocument,
    baseRule: ReturnType<typeof getCountryInvoiceRule>
  ) => boolean;
};

export const normalizeCountryCode = (value?: string | null) =>
  String(value || "").trim().toUpperCase() || null;

export const hasValue = (value: unknown) => String(value ?? "").trim().length > 0;

export const createCountryIssue = (
  field: string,
  code: string,
  message: string,
  severity: ComplianceValidationIssue["severity"],
  countryCode?: string | null
): ComplianceValidationIssue => ({
  field,
  code,
  message,
  severity,
  level: "COUNTRY",
  countryCode: normalizeCountryCode(countryCode),
});

export function buildDefaultCountryModule(
  countryCode: string,
  hooks: CountryModuleHooks = {}
): CountryComplianceModule {
  const baseRule = getCountryInvoiceRule(countryCode);
  const fallbackCountry = normalizeCountryCode(countryCode) || "US";

  return {
    countryCode: fallbackCountry,
    implementationType: hooks.implementationType || "DEFAULT",
    region: baseRule?.region || null,
    supportLevel: baseRule?.supportLevel || "LIMITED",
    taxSystem: baseRule?.taxSystem || null,
    taxLabel: baseRule?.taxLabel || "Tax",
    ruleVersion: hooks.ruleVersion || null,
    evidence: hooks.evidence || [],
    requiredFields(document) {
      const fields = [
        "invoice.invoiceNumber",
        "invoice.issueDate",
        "invoice.currency",
        "supplier.legalName",
        "supplier.countryCode",
        "customer.legalName",
      ];
      if (baseRule?.requiresSellerTaxId) {
        fields.push("supplier.taxId");
      }
      if (baseRule?.requiresBuyerTaxIdForB2B && document.buyerType === "B2B") {
        fields.push("customer.taxId");
      }
      if (baseRule?.requiresEInvoicing) {
        fields.push("invoice.deliveryModes");
      }
      return hooks.extendRequiredFields
        ? hooks.extendRequiredFields(fields, document, baseRule)
        : fields;
    },
    validate(document) {
      const issues: ComplianceValidationIssue[] = [];
      const compliance =
        document.complianceSnapshot ||
        resolveInvoiceCompliance({
          sellerCountry: document.countryContext.sellerCountryCode,
          buyerCountry: document.countryContext.buyerCountryCode,
          sellerTaxId: document.supplier.taxId || document.supplier.vatId,
          buyerTaxId: document.customer.taxId || document.customer.vatId,
          buyerType: document.buyerType,
          buyerCompanyName: document.customer.tradeName || document.customer.legalName,
          customerClassification:
            document.customer.classification === "BUSINESS"
              ? "BUSINESS"
              : document.customer.classification === "INDIVIDUAL"
                ? "INDIVIDUAL"
                : null,
          supplyType: document.supplyType,
          itemNames: document.lines.map((line) => line.description),
        });

      if (baseRule?.requiresSellerTaxId && !hasValue(document.supplier.taxId || document.supplier.vatId)) {
        issues.push(
          createCountryIssue(
            "supplier.taxId",
            "COUNTRY_SELLER_TAX_ID_REQUIRED",
            `Seller ${baseRule.taxLabel} registration details are required for ${fallbackCountry} invoices.`,
            "ERROR",
            fallbackCountry
          )
        );
      }

      if (
        baseRule?.requiresBuyerTaxIdForB2B &&
        document.buyerType === "B2B" &&
        !hasValue(document.customer.taxId || document.customer.vatId)
      ) {
        issues.push(
          createCountryIssue(
            "customer.taxId",
            "COUNTRY_BUYER_TAX_ID_REQUIRED",
            `Buyer ${baseRule.taxLabel} registration details are required for B2B invoices in ${fallbackCountry}.`,
            "ERROR",
            fallbackCountry
          )
        );
      }

      if (compliance.taxTreatment === "MANUAL_REVIEW") {
        issues.push(
          createCountryIssue(
            "invoice.countryContext",
            "COUNTRY_MANUAL_REVIEW_REQUIRED",
            "Cross-border tax treatment requires manual review before issuance.",
            "WARNING",
            fallbackCountry
          )
        );
      }

      if (compliance.reverseChargeApplies) {
        issues.push(
          createCountryIssue(
            "invoice.taxBreakdown",
            "COUNTRY_REVERSE_CHARGE_APPLIES",
            "Reverse-charge wording and tax treatment should be reflected in the invoice output.",
            "INFO",
            fallbackCountry
          )
        );
      }

      if (baseRule?.supportLevel === "LIMITED") {
        issues.push(
          createCountryIssue(
            "invoice.countryContext",
            "COUNTRY_LIMITED_SUPPORT",
            `Local compliance support for ${fallbackCountry} is still limited and should be reviewed manually.`,
            "WARNING",
            fallbackCountry
          )
        );
      }

      if (baseRule?.requiresEInvoicing) {
        issues.push(
          createCountryIssue(
            "invoice.deliveryModes",
            "COUNTRY_EINVOICING_REQUIRED",
            "This country requires an electronic invoicing workflow beyond PDF-only delivery.",
            "INFO",
            fallbackCountry
          )
        );
      }

      return hooks.extendValidation ? hooks.extendValidation(issues, document, baseRule) : issues;
    },
    transform(document) {
      const nextDeliveryModes = new Set(document.deliveryModes);
      if (baseRule?.requiresEInvoicing) {
        nextDeliveryModes.add("xml_export");
        nextDeliveryModes.add("api_submission");
      }

      const transformedDocument: UniversalInvoiceDocument = {
        ...document,
        deliveryModes: [...nextDeliveryModes],
        metadata: {
          ...(document.metadata || {}),
          countryRule: {
            countryCode: fallbackCountry,
            supportLevel: baseRule?.supportLevel || "LIMITED",
            taxSystem: baseRule?.taxSystem || null,
            taxLabel: baseRule?.taxLabel || "Tax",
            implementationType: hooks.implementationType || "DEFAULT",
            ruleVersion: hooks.ruleVersion || null,
            evidenceCount: hooks.evidence?.length ?? 0,
          },
        },
      };

      return hooks.extendTransform
        ? hooks.extendTransform(transformedDocument, baseRule)
        : transformedDocument;
    },
    exportFormats(document) {
      const formats = new Set<InvoiceExportFormat>(["PDF", "HTML", "JSON"]);
      const provider = resolveEInvoiceProvider({
        sellerCountry: document.countryContext.sellerCountryCode,
      });
      const providerDefinition = provider
        ? getEInvoiceProviderDefinition(provider.key)
        : null;
      if (baseRule?.requiresEInvoicing || providerDefinition) {
        formats.add("XML");
      }
      if (providerDefinition?.liveSubmissionAvailable || baseRule?.requiresEInvoicing) {
        formats.add("UBL_XML");
      }
      const nextFormats = [...formats];
      return hooks.extendExportFormats
        ? hooks.extendExportFormats(nextFormats, document, baseRule)
        : nextFormats;
    },
    supportsEInvoicing(document) {
      if (hooks.overrideSupportsEInvoicing) {
        return hooks.overrideSupportsEInvoicing(document, baseRule);
      }
      if (baseRule?.requiresEInvoicing) return true;
      return Boolean(
        resolveEInvoiceProvider({
          sellerCountry: document.countryContext.sellerCountryCode,
        })
      );
    },
  };
}
