const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET || "";
const BURST_COUNT = Number(process.env.AUTOMATION_BURST_COUNT || 40);
const BURST_CONCURRENCY = Number(process.env.AUTOMATION_BURST_CONCURRENCY || 8);
const WEBHOOK_PATH = process.env.AUTOMATION_WEBHOOK_PATH || "/stress/automation";

const cronHeaders = CRON_SECRET
  ? {
      "x-cron-secret": CRON_SECRET,
      authorization: `Bearer ${CRON_SECRET}`,
    }
  : {};

async function postJson(path, body, extraHeaders = {}) {
  const started = Date.now();
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body || {}),
  });
  const durationMs = Date.now() - started;
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, durationMs, body: parsed };
}

async function runBurst() {
  const jobs = Array.from({ length: BURST_COUNT }).map((_, index) => async () =>
    postJson(
      `/api/webhooks/ingest?path=${encodeURIComponent(WEBHOOK_PATH)}`,
      {
        eventId: `stress-${Date.now()}-${index}`,
        timestamp: new Date().toISOString(),
        data: {
          reference: `stress-ref-${index}`,
          amount: 1000 + index,
          channel: "stress-test",
        },
      }
    )
  );

  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, BURST_CONCURRENCY) }).map(async () => {
    while (cursor < jobs.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await jobs[idx]();
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log(`Automation stress drill against ${BASE_URL}`);
  console.log(`Burst: ${BURST_COUNT} events @ concurrency ${BURST_CONCURRENCY}`);

  const burst = await runBurst();
  const burstErrors = burst.filter((item) => item.status >= 500).length;
  const burstClientErrors = burst.filter((item) => item.status >= 400 && item.status < 500).length;
  const burstAvgMs = Math.round(
    burst.reduce((sum, item) => sum + (item?.durationMs || 0), 0) / Math.max(1, burst.length)
  );
  console.log(
    JSON.stringify(
      {
        stage: "webhook_burst",
        total: burst.length,
        avgMs: burstAvgMs,
        clientErrors: burstClientErrors,
        serverErrors: burstErrors,
      },
      null,
      2
    )
  );

  const processDue = await postJson("/api/automation/process-due", { limit: 100 }, cronHeaders);
  console.log(JSON.stringify({ stage: "process_due", status: processDue.status, body: processDue.body }, null, 2));

  const healthEmit = await postJson("/api/admin/automation/health", {}, cronHeaders);
  console.log(JSON.stringify({ stage: "health_emit", status: healthEmit.status, body: healthEmit.body }, null, 2));

  const hasHardFailure =
    burstErrors > 0 ||
    processDue.status >= 500 ||
    healthEmit.status >= 500 ||
    (processDue.status === 403 && !CRON_SECRET) ||
    (healthEmit.status === 403 && !CRON_SECRET);

  if (hasHardFailure) {
    throw new Error("Automation stress drill failed. Inspect output above.");
  }

  console.log("Automation stress drill completed.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
