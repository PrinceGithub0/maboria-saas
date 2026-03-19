const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const USER_A_COOKIE = process.env.USER_A_SESSION_COOKIE;
const USER_B_COOKIE = process.env.USER_B_SESSION_COOKIE;

function assertEnv() {
  if (!USER_A_COOKIE || !USER_B_COOKIE) {
    console.error("Missing session cookies.");
    console.error("Set:");
    console.error('  USER_A_SESSION_COOKIE="next-auth.session-token=..."');
    console.error('  USER_B_SESSION_COOKIE="next-auth.session-token=..."');
    console.error('Optional: BASE_URL="http://localhost:3000"');
    process.exit(1);
  }
}

async function request(path, { cookie, method = "GET", body } = {}) {
  const headers = {
    Cookie: cookie,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}

function ok(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

function uniqueEmail(prefix) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function run() {
  assertEnv();
  console.log(`Running tenant isolation checks against ${BASE_URL}`);

  const outsiderCustomerEmail = uniqueEmail("tenant-b");
  const outsiderCustomerName = `Tenant B Customer ${Date.now()}`;

  const createAsB = await request("/api/customers", {
    cookie: USER_B_COOKIE,
    method: "POST",
    body: {
      name: outsiderCustomerName,
      email: outsiderCustomerEmail,
      deliveryPreference: "EMAIL",
    },
  });

  ok(createAsB.status === 201, `User B can create customer (status ${createAsB.status})`);
  const outsiderCustomerId = createAsB.json?.id;
  ok(Boolean(outsiderCustomerId), "Created customer has id");

  const listAsA = await request(
    `/api/customers?q=${encodeURIComponent(outsiderCustomerEmail)}&take=20&skip=0`,
    { cookie: USER_A_COOKIE }
  );
  ok(listAsA.status === 200, `User A customer list request succeeds (status ${listAsA.status})`);
  const leaked = Array.isArray(listAsA.json?.items)
    ? listAsA.json.items.some((item) => item.id === outsiderCustomerId)
    : false;
  ok(!leaked, "User A cannot see User B customer in search results");

  const deleteAsA = await request(`/api/customers/${encodeURIComponent(String(outsiderCustomerId))}`, {
    cookie: USER_A_COOKIE,
    method: "DELETE",
  });
  ok(deleteAsA.status === 404, `User A cannot delete User B customer (status ${deleteAsA.status})`);

  const createInvoiceAsA = await request("/api/invoice", {
    cookie: USER_A_COOKIE,
    method: "POST",
    body: {
      invoiceNumber: `INV-TENANT-${Date.now()}`,
      currency: "USD",
      status: "DRAFT",
      customerId: outsiderCustomerId,
      items: [{ name: "Isolation Test", quantity: 1, price: 10 }],
    },
  });

  if (createInvoiceAsA.status === 402 || createInvoiceAsA.status === 403) {
    throw new Error(
      `User A cannot create invoices due to plan/access (${createInvoiceAsA.status}). ` +
        `Assign User A an active paid plan to run cross-tenant invoice assignment test.`
    );
  }

  ok(
    createInvoiceAsA.status === 400,
    `User A cannot assign User B customer to invoice (status ${createInvoiceAsA.status})`
  );
  ok(
    String(createInvoiceAsA.json?.error || "").toLowerCase().includes("customer is required"),
    "Cross-tenant assignment returns safe customer-required error"
  );

  const cleanup = await request(`/api/customers/${encodeURIComponent(String(outsiderCustomerId))}`, {
    cookie: USER_B_COOKIE,
    method: "DELETE",
  });
  ok(cleanup.status === 200, `Cleanup: User B can soft-delete own test customer (status ${cleanup.status})`);

  console.log("Tenant isolation checks passed.");
}

run().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});

