const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function expectStatus(path, options, expected) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const ok = res.status === expected;
  const body = await res.text();
  if (!ok) {
    throw new Error(
      `Expected ${expected} for ${path}, got ${res.status}. Body: ${body.slice(0, 200)}`
    );
  }
  return { status: res.status, body };
}

async function run() {
  console.log(`Running security checks against ${BASE_URL}`);

  await expectStatus(
    "/api/webhooks/paystack",
    {
      method: "POST",
      headers: { "x-paystack-signature": "invalid" },
      body: JSON.stringify({ event: "charge.success", data: {} }),
    },
    400
  );

  await expectStatus(
    "/api/webhooks/flutterwave",
    {
      method: "POST",
      headers: { "verif-hash": "invalid" },
      body: JSON.stringify({ event: "charge.completed", data: {} }),
    },
    401
  );

  await expectStatus("/api/automation", { method: "GET" }, 401);

  console.log("Security checks passed.");
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
