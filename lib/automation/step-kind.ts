type StepLike = {
  type?: unknown;
  config?: Record<string, unknown> | null;
};

const readString = (value: unknown) => String(value || "").trim();

export const isAutomationTriggerMetadataStep = (step: StepLike | null | undefined) => {
  if (!step || typeof step !== "object") return false;
  const config = step.config && typeof step.config === "object" ? step.config : null;
  if (!config) return false;
  const startId = readString(config.startId);
  if (!startId) return false;
  const actionId = readString(config.actionId);
  return !actionId;
};
