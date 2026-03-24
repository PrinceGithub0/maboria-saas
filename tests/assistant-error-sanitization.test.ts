import assert from "node:assert/strict";
import { getSafeAssistantError } from "@/lib/ai/assistant-error";

assert.deepEqual(
  getSafeAssistantError({
    status: 401,
    code: "invalid_api_key",
    message:
      "401 Incorrect API key provided: sk-proj-abc123. You can find your API key at https://platform.openai.com/account/api-keys.",
  }),
  {
    status: 503,
    message: "Assistant service is temporarily unavailable. Please try again later or contact support.",
  }
);

assert.deepEqual(getSafeAssistantError(new Error("Temporary upstream timeout")), {
  status: 500,
  message: "Temporary upstream timeout",
});

console.log("assistant error sanitization rules passed");
