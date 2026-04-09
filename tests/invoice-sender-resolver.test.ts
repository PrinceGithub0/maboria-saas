import assert from "node:assert/strict";

import { pickPreferredInvoiceSenderOption } from "@/lib/invoice-sender-resolver";

const options = [
  {
    id: "gmail_1",
    senderType: "gmail" as const,
  },
  {
    id: "outlook_1",
    senderType: "outlook" as const,
  },
  {
    id: "whatsapp_1",
    senderType: "whatsapp" as const,
  },
];

const autoPicked = pickPreferredInvoiceSenderOption({
  options,
});

assert.equal(autoPicked?.option.id, "gmail_1", "auto resolution should prefer the first priority sender");
assert.equal(autoPicked?.resolutionSource, "auto_best", "auto resolution should report auto_best");

const defaultPicked = pickPreferredInvoiceSenderOption({
  options,
  workspaceDefaultSenderId: "whatsapp_1",
});

assert.equal(defaultPicked?.option.id, "whatsapp_1", "workspace default sender should override automatic priority");
assert.equal(defaultPicked?.resolutionSource, "workspace_default", "default resolution should report workspace_default");

console.log("invoice sender resolver passed");
