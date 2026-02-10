const normalizeSubscriptionStatus = (status) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") return "ACTIVE";
  if (normalized === "PAST_DUE") return "PAST_DUE";
  if (normalized === "CANCELED") return "CANCELED";
  if (normalized === "INACTIVE") return "INACTIVE";
  if (normalized === "REVOKED") return "REVOKED";
  return "INCOMPLETE";
};

const getSubscriptionGate = (status) => {
  const normalized = normalizeSubscriptionStatus(status);
  return {
    status: normalized,
    active: normalized === "ACTIVE",
    locked: normalized !== "ACTIVE",
  };
};

const tests = [
  {
    name: "INCOMPLETE blocks dashboard",
    run: () => {
      const gate = getSubscriptionGate("INCOMPLETE");
      if (!gate.locked || gate.active) throw new Error("INCOMPLETE should be locked");
    },
  },
  {
    name: "ACTIVE allows dashboard",
    run: () => {
      const gate = getSubscriptionGate("ACTIVE");
      if (gate.locked || !gate.active) throw new Error("ACTIVE should allow access");
    },
  },
  {
    name: "PAST_DUE blocks dashboard",
    run: () => {
      const gate = getSubscriptionGate("PAST_DUE");
      if (!gate.locked) throw new Error("PAST_DUE should be locked");
    },
  },
  {
    name: "REVOKED blocks dashboard",
    run: () => {
      const gate = getSubscriptionGate("REVOKED");
      if (!gate.locked) throw new Error("REVOKED should be locked");
    },
  },
  {
    name: "Status normalization is stable",
    run: () => {
      const status = normalizeSubscriptionStatus("active");
      if (status !== "ACTIVE") throw new Error("Status normalization failed");
    },
  },
];

let failed = 0;
for (const test of tests) {
  try {
    test.run();
    console.log(`✓ ${test.name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${test.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exit(1);
}
