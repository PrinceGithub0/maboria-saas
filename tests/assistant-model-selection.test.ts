import assert from "node:assert/strict";
import {
  normalizeAssistantModelChoice,
  resolveAssistantOpenAiModel,
} from "@/lib/ai/model-selection";

assert.equal(normalizeAssistantModelChoice(undefined), "maboria-1");
assert.equal(normalizeAssistantModelChoice("maboria-1"), "maboria-1");
assert.equal(normalizeAssistantModelChoice("maboria-2"), "maboria-2");
assert.equal(normalizeAssistantModelChoice("anything-else"), "maboria-1");

assert.equal(resolveAssistantOpenAiModel("maboria-1"), "gpt-4.1-mini");
assert.equal(resolveAssistantOpenAiModel("maboria-2"), "gpt-4.1");
assert.equal(resolveAssistantOpenAiModel("unknown"), "gpt-4.1-mini");

console.log("assistant model selection rules passed");
