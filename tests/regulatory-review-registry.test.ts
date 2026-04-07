import assert from "node:assert/strict";

import {
  getCountryRegulatoryReview,
  listCountryRegulatoryReviews,
} from "@/lib/invoicing/regulatory-review-registry";

const germany = getCountryRegulatoryReview("DE");
assert.ok(germany, "Germany should have a regulatory review record");
assert.equal(germany?.owner, "tax-content");
assert.equal(germany?.sourceEvidenceCount, 4);
assert.equal(germany?.lastReviewedAt, "2026-04-06");
assert.equal(germany?.nextReviewDueAt, "2026-10-03");
assert.equal(germany?.cadenceDays, 180);
assert.equal(germany?.status, "COMPLETE");

const unitedArabEmirates = getCountryRegulatoryReview("AE");
assert.ok(unitedArabEmirates, "UAE should have a regulatory review record");
assert.equal(unitedArabEmirates?.owner, "compliance-platform");
assert.equal(unitedArabEmirates?.sourceEvidenceCount, 1);
assert.equal(unitedArabEmirates?.signoffEvidenceCount, 1);
assert.equal(unitedArabEmirates?.lastReviewedAt, "2026-04-07");
assert.equal(unitedArabEmirates?.nextReviewDueAt, "2026-07-06");
assert.equal(unitedArabEmirates?.cadenceDays, 90);

const poland = getCountryRegulatoryReview("PL");
assert.ok(poland, "Poland should have a regulatory review record");
assert.equal(poland?.owner, "compliance-platform");
assert.equal(poland?.sourceEvidenceCount, 1);
assert.equal(poland?.signoffEvidenceCount, 1);
assert.equal(poland?.lastReviewedAt, "2026-04-07");
assert.equal(poland?.nextReviewDueAt, "2026-07-06");

const all = listCountryRegulatoryReviews();
assert.ok(all.length > 150, "Regulatory review registry should cover the supported country list");

console.log("regulatory review registry passed");
