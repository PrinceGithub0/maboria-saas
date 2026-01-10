const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const COOKIE = process.env.SESSION_COOKIE;

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (COOKIE) headers["Cookie"] = COOKIE;
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const body = await res.text();
  return { status: res.status, body };
}

async function expect(path, expected) {
  const res = await request(path);
  if (res.status !== expected) {
    throw new Error(`Expected ${expected} for ${path}, got ${res.status}. Body: ${res.body.slice(0, 200)}`);
  }
}

async function run() {
  if (!COOKIE) {
    console.error("SESSION_COOKIE env var missing. Example:");
    console.error('SESSION_COOKIE="next-auth.session-token=..." node scripts/entitlement-check.js');
    process.exit(1);
  }

  console.log(`Running entitlement checks against ${BASE_URL}`);

  const me = await request("/api/user/me");
  if (me.status !== 200) {
    throw new Error(`Expected 200 for /api/user/me, got ${me.status}. Body: ${me.body.slice(0, 200)}`);
  }
  const meJson = JSON.parse(me.body || "{}");
  const plan = String(meJson.plan || "free").toLowerCase();
  const subscriptions = Array.isArray(meJson.subscriptions) ? meJson.subscriptions : [];
  const trialActive = subscriptions.some((sub) => {
    if (!sub || sub.status !== "TRIALING") return false;
    if (!sub.trialEndsAt) return true;
    return new Date(sub.trialEndsAt).getTime() > Date.now();
  });

  const canAutomation = trialActive || ["starter", "pro", "enterprise"].includes(plan);
  const canInvoices = canAutomation;
  const canAI = !trialActive && ["pro", "enterprise"].includes(plan);

  await expect("/api/automation", canAutomation ? 200 : 403);
  await expect("/api/invoice", canInvoices ? 200 : 403);
  const aiResponse = await request("/api/ai/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "test" }),
  });
  if (aiResponse.status !== (canAI ? 200 : 403)) {
    throw new Error(
      `Expected ${canAI ? 200 : 403} for /api/ai/assistant, got ${aiResponse.status}. Body: ${aiResponse.body.slice(0, 200)}`
    );
  }

  console.log("Entitlement checks passed (expected blocked statuses).");
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
