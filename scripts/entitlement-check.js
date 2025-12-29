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

  await expect("/api/automation", 403);
  await expect("/api/invoice", 403);
  await expect("/api/ai/assistant", 403);

  console.log("Entitlement checks passed (expected blocked statuses).");
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
