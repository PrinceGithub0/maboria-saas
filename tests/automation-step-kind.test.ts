import assert from "node:assert/strict";
import { isAutomationTriggerMetadataStep } from "../lib/automation/step-kind";

assert.equal(
  isAutomationTriggerMetadataStep({
    type: "generateInvoice",
    config: { startId: "invoice_paid" },
  }),
  true,
  "trigger rows should be treated as metadata even if their legacy type matches an executable step"
);

assert.equal(
  isAutomationTriggerMetadataStep({
    type: "generateInvoice",
    config: { actionId: "create_invoice" },
  }),
  false,
  "real action steps must remain executable"
);

assert.equal(
  isAutomationTriggerMetadataStep({
    type: "sendWhatsApp",
    config: { startId: "whatsapp_received", actionId: "send_whatsapp_message" },
  }),
  false,
  "steps with an action id are action rows, not trigger metadata"
);

console.log("ok automation step kind rules passed");
