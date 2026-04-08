import assert from "node:assert/strict";

import { getMessageCatalog } from "@/lib/i18n-catalog";
import { getLocalizedText, resolveLocalizedText } from "@/lib/i18n";

assert.equal(
  getLocalizedText({ en: "Close", de: "Schlie?en" }, "de"),
  "Schließen",
  "German placeholder replacements should round-trip through Unicode correctly"
);

assert.equal(
  getLocalizedText({ en: "No", pt: "N?o" }, "pt"),
  "Não",
  "Portuguese placeholder replacements should decode to NFC Unicode"
);

assert.equal(
  resolveLocalizedText({ en: "Settings", pt: "Configura??es" }).pt,
  "Configurações",
  "Resolved localized text should repair double-question-mark placeholders"
);

assert.equal(
  getMessageCatalog("de")["common.close"],
  "Schließen",
  "Catalog-backed messages should remain readable after sanitization"
);

assert.equal(
  getLocalizedText({ en: "Choose Starter", de: "Starter waehlen" }, "de"),
  "Starter wählen",
  "German ae transliterations should be repaired in CTA copy"
);

assert.equal(
  getLocalizedText({ en: "Selected Plan", de: "Ausgewahlter Plan" }, "de"),
  "Ausgewählter Plan",
  "German selected-state copy should repair missing umlauts"
);

assert.equal(
  getLocalizedText({ en: "Mailboxes", de: "verbundene E-Mail-Postfacher" }, "de"),
  "verbundene E-Mail-Postfächer",
  "German mailbox plurals should repair remaining umlaut forms"
);

console.log("i18n repair rules passed");
