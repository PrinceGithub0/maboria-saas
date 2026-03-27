import { Prisma } from "@prisma/client";

type AutomationRunInput = Prisma.InputJsonObject;

type ScheduledAutomationRunOutput<TInput extends AutomationRunInput> = Prisma.InputJsonObject & {
  trigger: "Schedule";
  source: "Scheduler";
  input: (TInput & {
    scheduledFor: string;
  }) & Prisma.InputJsonObject;
  resumeState: Prisma.InputJsonObject & {
    lastCompletedStepIndex: number;
    nextStepIndex: number;
    nextRunAt: string;
    updatedAt: string;
    retryState: Prisma.InputJsonObject;
  };
};

export const parseScheduledAutomationRunAt = (value: unknown) => {
  if (!value) return new Date();
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const buildScheduledAutomationRunOutput = <TInput extends AutomationRunInput>(
  runAt: Date,
  input: TInput = {} as TInput
) => {
  const scheduledFor = runAt.toISOString();
  const mergedInput = {
    ...input,
    scheduledFor,
  };

  return {
    trigger: "Schedule",
    source: "Scheduler",
    input: mergedInput,
    resumeState: {
      lastCompletedStepIndex: -1,
      nextStepIndex: 0,
      nextRunAt: scheduledFor,
      updatedAt: new Date().toISOString(),
      retryState: {},
    },
  } satisfies ScheduledAutomationRunOutput<typeof mergedInput>;
};
