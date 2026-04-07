import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const albaniaComplianceModule = buildDefaultCountryModule("AL", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Albania tax administration fiscalization overview",
      url: "https://www.tatime.gov.al/eng/c/320/fiscalization",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Albania procedure for issuing electronic invoices",
      url: "https://www.tatime.gov.al/d/8/45/0/1478/procedura-e-leshimit-te-faturave-elektronike",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1", "supplier.city", "customer.addressLine1", "customer.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "AL_LINE_DESCRIPTION_REQUIRED",
          "Albanian fiscal invoices should clearly identify the goods or services supplied.",
          "ERROR",
          "AL"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "AL_FISCALIZATION_WORKFLOW_REQUIRED",
        "Albania requires electronic invoice exchange through the central fiscalization platform where applicable.",
        "INFO",
        "AL"
      )
    );
    return issues;
  },
});
