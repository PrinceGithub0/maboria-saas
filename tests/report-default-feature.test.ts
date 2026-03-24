import assert from "node:assert/strict";
import { pickDefaultTrendFeature } from "@/lib/usage/report";

const emptySeries = {
  ai_requests: [{ date: "2026-03-01", value: 0 }],
  invoices: [{ date: "2026-03-01", value: 0 }],
  whatsapp_messages: [{ date: "2026-03-01", value: 0 }],
  automations_runs: [{ date: "2026-03-01", value: 0 }],
  team_members_seats: [],
};

assert.equal(
  pickDefaultTrendFeature({
    totalsByFeature: new Map([
      ["ai_requests", 0],
      ["invoices", 4],
      ["whatsapp_messages", 0],
      ["automations_runs", 0],
    ]),
    series: emptySeries,
  }),
  "invoices",
  "invoice usage should become the default trend when AI usage is empty"
);

assert.equal(
  pickDefaultTrendFeature({
    totalsByFeature: new Map([
      ["ai_requests", 0],
      ["invoices", 0],
      ["whatsapp_messages", 0],
      ["automations_runs", 0],
    ]),
    series: {
      ...emptySeries,
      automations_runs: [{ date: "2026-03-01", value: 2 }],
    },
  }),
  "automations_runs",
  "trend data should choose the first non-empty metered series when totals are zero"
);

assert.equal(
  pickDefaultTrendFeature({
    totalsByFeature: new Map(),
    series: emptySeries,
  }),
  "ai_requests",
  "AI should remain the fallback when all report metrics are empty"
);

console.log("report default feature rules passed");
