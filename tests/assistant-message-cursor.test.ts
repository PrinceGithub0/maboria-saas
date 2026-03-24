import assert from "node:assert/strict";
import { decodeAssistantMessageCursor } from "@/lib/assistant-message-cursor";

assert.equal(decodeAssistantMessageCursor(undefined), null);
assert.equal(decodeAssistantMessageCursor(null), null);
assert.equal(decodeAssistantMessageCursor(""), null);
assert.equal(decodeAssistantMessageCursor("   "), null);
assert.equal(decodeAssistantMessageCursor("cursor_123"), "cursor_123");
assert.equal(decodeAssistantMessageCursor("  cursor_456  "), "cursor_456");

console.log("assistant message cursor rules passed");
