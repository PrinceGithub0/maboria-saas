import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const lithuaniaComplianceModule = buildDefaultCountryModule("LT", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Lithuania SABIS migration for public-sector and contracting-entity e-invoicing",
      url: "https://eimin.lrv.lt/en/structure-and-contacts/news-1/important-news-for-businesses-as-of-30-august-esaskaita-e-account-will-no-longer-be-available-and-will-be-replaced-by-sabis",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Lithuania free e-invoicing tool in SABIS and European standard support",
      url: "https://eimin.lrv.lt/en/structure-and-contacts/news-1/free-e-invoicing-tool-in-a-smarter-system/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.postalCode");
    fields.push("supplier.city");
    fields.push("customer.addressLine1");
    fields.push("customer.postalCode");
    fields.push("customer.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "LT_LINE_DESCRIPTION_REQUIRED",
          "Lithuanian invoices must describe the goods or services supplied.",
          "ERROR",
          "LT"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "LT_SABIS_EINVOICE_REQUIRED",
        "Lithuania routes structured invoices through SABIS for public-sector and contracting-entity flows; confirm applicability.",
        "INFO",
        "LT"
      )
    );
    return issues;
  },
});
