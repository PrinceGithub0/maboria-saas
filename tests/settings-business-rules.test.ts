import assert from "node:assert/strict";

import {
  hasRequiredBusinessTaxId,
  normalizeBusinessTaxId,
  requiresBusinessTaxId,
} from "../lib/business-profile";

function run() {
  assert.equal(requiresBusinessTaxId(false), false, "VAT disabled should not require tax ID");
  assert.equal(requiresBusinessTaxId(true), true, "VAT enabled should require tax ID");

  assert.equal(
    hasRequiredBusinessTaxId({ vatEnabled: false, taxId: "" }),
    true,
    "blank tax ID should be allowed when VAT is disabled"
  );
  assert.equal(
    hasRequiredBusinessTaxId({ vatEnabled: true, taxId: "" }),
    false,
    "blank tax ID should be rejected when VAT is enabled"
  );
  assert.equal(
    hasRequiredBusinessTaxId({ vatEnabled: true, taxId: " VAT-123 " }),
    true,
    "trimmed tax ID should satisfy VAT requirement"
  );

  assert.equal(
    normalizeBusinessTaxId({ vatEnabled: false, taxId: " VAT-123 " }),
    null,
    "tax ID should be cleared when VAT is disabled"
  );
  assert.equal(
    normalizeBusinessTaxId({ vatEnabled: true, taxId: " VAT-123 " }),
    "VAT-123",
    "tax ID should be trimmed when VAT is enabled"
  );
  assert.equal(
    normalizeBusinessTaxId({ vatEnabled: true, taxId: "   " }),
    null,
    "blank tax ID should normalize to null"
  );

  console.log("settings business rule checks passed");
}

run();
