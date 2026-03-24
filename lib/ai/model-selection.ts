export type AssistantModelChoice = "maboria-1" | "maboria-2";

export function normalizeAssistantModelChoice(value?: string | null): AssistantModelChoice {
  return value === "maboria-2" ? "maboria-2" : "maboria-1";
}

export function resolveAssistantOpenAiModel(value?: string | null) {
  const choice = normalizeAssistantModelChoice(value);
  return choice === "maboria-2" ? "gpt-4.1" : "gpt-4.1-mini";
}
