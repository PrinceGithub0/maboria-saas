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

assert.equal(
  getLocalizedText({ en: "Mailboxes", de: "Jagen Sie Zahlungen nicht langer zwischen Postfaechern und Tabellen hinterher" }, "de"),
  "Jagen Sie Zahlungen nicht langer zwischen Postfächern und Tabellen hinterher",
  "German mailbox dative forms should repair remaining umlaut transliterations"
);

assert.equal(
  getLocalizedText({ en: "Ready", fr: "Pr?t" }, "fr"),
  "Prêt",
  "French ready-state copy should repair capitalized circumflex placeholders"
);

assert.equal(
  getLocalizedText({ en: "Generated", fr: "Facture g?n?r?e avec Maboria." }, "fr"),
  "Facture générée avec Maboria.",
  "French generated-state copy should repair repeated accent placeholders"
);

assert.equal(
  getLocalizedText({ en: "AI ready", fr: "L?IA aide a configurer les workflows" }, "fr"),
  "L'IA aide a configurer les workflows",
  "French AI copy should repair leading apostrophe placeholders"
);

assert.equal(
  getLocalizedText(
    { en: "Invoice currency", fr: "Cette facture utilis? une devise non prise en charge. Veuillez contacter l'exp?diteur." },
    "fr"
  ),
  "Cette facture utilise une devise non prise en charge. Veuillez contacter l'expéditeur.",
  "French invoice copy should repair question-mark placeholders without altering verb tense"
);

assert.equal(
  getLocalizedText({ en: "Flows", de: "Abl?ufe" }, "de"),
  "Abläufe",
  "German flow labels should repair remaining umlaut placeholders"
);

assert.equal(
  getLocalizedText({ en: "Tomorrow morning", de: "Zahlungserinnerung f?r morgen fr?h eingeplant." }, "de"),
  "Zahlungserinnerung für morgen früh eingeplant.",
  "German time-of-day copy should repair remaining ue and umlaut placeholders"
);

assert.equal(
  getLocalizedText({ en: "Automatic", es: "Autom?tico" }, "es"),
  "Automático",
  "Spanish automatic labels should repair acute accent placeholders"
);

assert.equal(
  getLocalizedText({ en: "Usage analytics", es: "Anal?tica de uso" }, "es"),
  "Analítica de uso",
  "Spanish analytics labels should repair accented i placeholders"
);

assert.equal(
  getLocalizedText({ en: "Automatic", pt: "Autom?tico" }, "pt"),
  "Automático",
  "Portuguese automatic labels should repair acute accent placeholders"
);

assert.equal(
  getLocalizedText({ en: "Applications", pt: "O n?mero maximo de aplicacoes" }, "pt"),
  "O número maximo de aplicações",
  "Portuguese numeric labels should repair remaining placeholder accents"
);

console.log("i18n repair rules passed");
