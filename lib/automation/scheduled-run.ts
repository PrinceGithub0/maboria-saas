type AutomationRunInput = Record<string, unknown>;

export const parseScheduledAutomationRunAt = (value: unknown) => {
  if (!value) return new Date();
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const buildScheduledAutomationRunOutput = (
  runAt: Date,
  input: AutomationRunInput = {}
) => {
  const scheduledFor = runAt.toISOString();
  return {
    trigger: "Schedule",
    source: "Scheduler",
    input: {
      ...input,
      scheduledFor,
    },
    resumeState: {
      lastCompletedStepIndex: -1,
      nextStepIndex: 0,
      nextRunAt: scheduledFor,
      updatedAt: new Date().toISOString(),
      retryState: {},
    },
  };
};
