type StepLike = {
  type?: string;
  config?: Record<string, unknown>;
};

const FINANCIAL_ACTION_IDS = new Set([
  "issue_refund",
  "mark_as_paid",
  "cancel_invoice",
  "apply_late_fee",
]);

const FINANCIAL_STEP_TYPES = new Set([
  "issueRefund",
  "markInvoicePaid",
  "cancelInvoice",
  "applyLateFee",
  "refundPayment",
]);

const readString = (value: unknown) => String(value || "").trim().toLowerCase();

const isFinancialStep = (step: StepLike) => {
  const stepType = readString(step?.type);
  if (FINANCIAL_STEP_TYPES.has(stepType)) return true;

  const config = step?.config || {};
  const actionId = readString(config["actionId"]);
  if (FINANCIAL_ACTION_IDS.has(actionId)) return true;

  const operation = readString(config["operation"]);
  if (FINANCIAL_STEP_TYPES.has(operation)) return true;

  return false;
};

export const requiresFinancialAutomationPrivilege = (steps: StepLike[] = []) =>
  steps.some((step) => isFinancialStep(step));
