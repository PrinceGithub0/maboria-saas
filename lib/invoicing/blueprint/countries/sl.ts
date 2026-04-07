import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const sierraLeoneComplianceModule = buildDefaultCountryModule("SL", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Sierra Leone GST guidance",
      url: "https://mail.nra.gov.sl/businesses-and-organisations/goods-services-tax",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Sierra Leone taxpayer identification guidance",
      url: "https://mail.nra.gov.sl/taxpayer-identification-number",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1", "supplier.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "SL_TIN_REQUIRED",
          "Sierra Leone GST records should include the supplier TIN.",
          "ERROR",
          "SL"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "SL_LINE_DESCRIPTION_REQUIRED",
          "Sierra Leone GST records should describe the goods or services supplied.",
          "ERROR",
          "SL"
        )
      );
    }
    return issues;
  },
});
