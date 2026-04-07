import { prisma } from "@/lib/prisma";
import type { BlueprintValidationResult } from "@/lib/invoicing/blueprint/types";

type UpsertInvoiceComplianceArtifactsInput = {
  invoiceId: string;
  validation: BlueprintValidationResult;
};

function getComplianceRecordDelegate() {
  return (prisma as any).invoiceComplianceRecord || null;
}

function getComplianceIssueDelegate() {
  return (prisma as any).invoiceComplianceIssue || null;
}

const countIssues = (validation: BlueprintValidationResult, severity: "ERROR" | "WARNING" | "INFO") =>
  validation.issues.filter((issue) => issue.severity === severity).length;

export async function upsertInvoiceComplianceArtifacts(
  input: UpsertInvoiceComplianceArtifactsInput
) {
  const complianceRecordDelegate = getComplianceRecordDelegate();
  const complianceIssueDelegate = getComplianceIssueDelegate();
  if (!complianceRecordDelegate || !complianceIssueDelegate) {
    return { persisted: false as const, reason: "delegate_unavailable" as const };
  }

  const persistedDocument = {
    ...input.validation.document,
    invoiceId: input.invoiceId,
  };

  const validationSummary = {
    ok: input.validation.ok,
    byLevel: {
      GENERIC: input.validation.byLevel.GENERIC.length,
      COUNTRY: input.validation.byLevel.COUNTRY.length,
      EINVOICE: input.validation.byLevel.EINVOICE.length,
    },
    issueCount: input.validation.issues.length,
    countryModule: input.validation.countryModule
      ? {
          countryCode: input.validation.countryModule.countryCode,
          implementationType: input.validation.countryModule.implementationType,
          supportLevel: input.validation.countryModule.supportLevel,
          taxSystem: input.validation.countryModule.taxSystem,
          ruleVersion: input.validation.countryModule.ruleVersion || null,
          evidenceCount: input.validation.countryModule.evidence?.length ?? 0,
        }
      : null,
  };

  const record = await complianceRecordDelegate.upsert({
    where: { invoiceId: input.invoiceId },
    create: {
      invoiceId: input.invoiceId,
      sellerCountryCode: input.validation.document.countryContext.sellerCountryCode,
      buyerCountryCode: input.validation.document.countryContext.buyerCountryCode,
      supportLevel: input.validation.document.countryContext.supportLevel,
      taxSystem: input.validation.document.countryContext.taxSystem,
      buyerType: input.validation.document.buyerType,
      supplyType: input.validation.document.supplyType,
      requiresEInvoicing: Boolean(input.validation.document.complianceSnapshot?.requiresEInvoicing),
      blockingIssueCount: countIssues(input.validation, "ERROR"),
      warningIssueCount: countIssues(input.validation, "WARNING"),
      infoIssueCount: countIssues(input.validation, "INFO"),
      document: persistedDocument as any,
      validationSummary: validationSummary as any,
    },
    update: {
      sellerCountryCode: input.validation.document.countryContext.sellerCountryCode,
      buyerCountryCode: input.validation.document.countryContext.buyerCountryCode,
      supportLevel: input.validation.document.countryContext.supportLevel,
      taxSystem: input.validation.document.countryContext.taxSystem,
      buyerType: input.validation.document.buyerType,
      supplyType: input.validation.document.supplyType,
      requiresEInvoicing: Boolean(input.validation.document.complianceSnapshot?.requiresEInvoicing),
      blockingIssueCount: countIssues(input.validation, "ERROR"),
      warningIssueCount: countIssues(input.validation, "WARNING"),
      infoIssueCount: countIssues(input.validation, "INFO"),
      document: persistedDocument as any,
      validationSummary: validationSummary as any,
    },
    select: { id: true },
  });

  await complianceIssueDelegate.deleteMany({
    where: { complianceRecordId: record.id },
  });

  if (input.validation.issues.length > 0) {
    await complianceIssueDelegate.createMany({
      data: input.validation.issues.map((issue) => ({
        complianceRecordId: record.id,
        field: issue.field,
        code: issue.code,
        message: issue.message,
        severity: issue.severity,
        level: issue.level,
        countryCode: issue.countryCode || null,
      })),
    });
  }

  return { persisted: true as const, complianceRecordId: record.id };
}
