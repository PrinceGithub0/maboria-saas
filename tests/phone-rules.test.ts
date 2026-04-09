import assert from "node:assert/strict";

import { normalizeInternationalPhoneDigits } from "@/lib/phone";

assert.equal(
  normalizeInternationalPhoneDigits("+49 1512 3456789"),
  "4915123456789",
  "should preserve explicit international numbers"
);

assert.equal(
  normalizeInternationalPhoneDigits("0044 7700 900123"),
  "447700900123",
  "should convert 00-prefixed international numbers"
);

assert.throws(
  () => normalizeInternationalPhoneDigits("08012345678"),
  /country code/i,
  "local numbers without country code should be rejected instead of guessed"
);

console.log("phone rules passed");
