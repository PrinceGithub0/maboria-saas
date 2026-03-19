const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE;
const NON_ADMIN_COOKIE = process.env.NON_ADMIN_SESSION_COOKIE || process.env.USER_SESSION_COOKIE;
const TARGET_TICKET_ID = process.env.SUPPORT_TICKET_ID;
const ARCHIVED_TICKET_ID = process.env.SUPPORT_ARCHIVED_TICKET_ID;

function fail(message) {
  console.error(`× ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`✓ ${message}`);
}

async function request(path, { method = "GET", cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function run() {
  if (!ADMIN_COOKIE) {
    fail('Missing ADMIN_SESSION_COOKIE. Example: ADMIN_SESSION_COOKIE="next-auth.session-token=..."');
  }
  if (!NON_ADMIN_COOKIE) {
    fail('Missing NON_ADMIN_SESSION_COOKIE (or USER_SESSION_COOKIE). Example: NON_ADMIN_SESSION_COOKIE="next-auth.session-token=..."');
  }

  const list = await request("/api/admin/support?page=1&pageSize=10", { cookie: ADMIN_COOKIE });
  if (list.status !== 200) {
    fail(`Admin support list failed (${list.status}): ${list.text}`);
  }
  const ticketId = TARGET_TICKET_ID || list.json?.items?.[0]?.id;
  if (!ticketId) {
    fail("No ticket found for phase 2/3 checks");
  }

  const detail = await request(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}`, {
    cookie: ADMIN_COOKIE,
  });
  if (detail.status !== 200) {
    fail(`Support ticket detail failed (${detail.status}): ${detail.text}`);
  }
  pass("Ticket detail loaded");

  const initialVersion = detail.json?.version;
  const initialAssignee = detail.json?.assignedAdminId || null;

  const emptyNote = await request(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/notes`, {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: { message: "   ", version: initialVersion },
  });
  if (emptyNote.status !== 422) {
    fail(`Empty internal note should return 422, got ${emptyNote.status}`);
  }
  pass("Internal note validation rejects empty message");

  const noteMessage = `Phase2 note ${Date.now()}`;
  const addNote = await request(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/notes`, {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: { message: noteMessage, version: initialVersion },
  });
  if (addNote.status !== 201) {
    fail(`Adding internal note failed (${addNote.status}): ${addNote.text}`);
  }
  pass("Internal note is created");

  const afterNoteDetail = await request(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}`, {
    cookie: ADMIN_COOKIE,
  });
  if (afterNoteDetail.status !== 200) {
    fail(`Reload after note failed (${afterNoteDetail.status})`);
  }
  if ((afterNoteDetail.json?.assignedAdminId || null) !== initialAssignee) {
    fail("Internal note changed assignee; expected no auto-assign for notes");
  }
  pass("Internal note does not auto-assign ticket");

  const staleNote = await request(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/notes`, {
    method: "POST",
    cookie: ADMIN_COOKIE,
    body: { message: "stale note", version: initialVersion },
  });
  if (staleNote.status !== 409) {
    fail(`Stale note version should return 409, got ${staleNote.status}`);
  }
  pass("Internal note enforces optimistic concurrency");

  const timeline = await request(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/timeline?page=1&pageSize=5`, {
    cookie: ADMIN_COOKIE,
  });
  if (timeline.status !== 200) {
    fail(`Timeline fetch failed (${timeline.status}): ${timeline.text}`);
  }
  pass("Timeline endpoint returns paginated events");

  const nonAdminTimeline = await request(
    `/api/admin/support/tickets/${encodeURIComponent(ticketId)}/timeline?page=1&pageSize=5`,
    { cookie: NON_ADMIN_COOKIE }
  );
  if (nonAdminTimeline.status !== 403) {
    fail(`Non-admin timeline should return 403, got ${nonAdminTimeline.status}`);
  }
  pass("Timeline endpoint blocks unauthorized role");

  const currentVersion = afterNoteDetail.json?.version;
  const staleStatus = await request(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/status`, {
    method: "PATCH",
    cookie: ADMIN_COOKIE,
    body: { status: "OPEN", version: Math.max(0, Number(currentVersion || 0) - 1) },
  });
  if (staleStatus.status !== 409) {
    fail(`Status stale version should return 409, got ${staleStatus.status}`);
  }
  pass("Status update enforces optimistic concurrency");

  const stalePriority = await request(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/priority`, {
    method: "PATCH",
    cookie: ADMIN_COOKIE,
    body: { priority: "MEDIUM", version: Math.max(0, Number(currentVersion || 0) - 1) },
  });
  if (stalePriority.status !== 409) {
    fail(`Priority stale version should return 409, got ${stalePriority.status}`);
  }
  pass("Priority update enforces optimistic concurrency");

  if (ARCHIVED_TICKET_ID) {
    const archivedDetail = await request(`/api/admin/support/tickets/${encodeURIComponent(ARCHIVED_TICKET_ID)}`, {
      cookie: ADMIN_COOKIE,
    });
    if (archivedDetail.status === 200) {
      const archivedNote = await request(`/api/admin/support/tickets/${encodeURIComponent(ARCHIVED_TICKET_ID)}/notes`, {
        method: "POST",
        cookie: ADMIN_COOKIE,
        body: { message: "should fail", version: archivedDetail.json?.version },
      });
      if (archivedNote.status !== 400) {
        fail(`Archived note should return 400, got ${archivedNote.status}`);
      }
      pass("Archived ticket blocks internal notes");
    } else {
      console.log("• Skipped archived note check; archived ticket id was not accessible");
    }
  } else {
    console.log("• Skipped archived note check (set SUPPORT_ARCHIVED_TICKET_ID to enable)");
  }

  console.log("Support phase 2/3 checks passed.");
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : "Unexpected error");
});
