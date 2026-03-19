import { NextResponse } from "next/server";

export async function legacyInboxEndpointDisabled() {
  return NextResponse.json(
    {
      error: "Legacy WhatsApp inbox endpoint disabled.",
      code: "LEGACY_INBOX_DISABLED",
      replacement: "/api/inbox/unified/*",
    },
    { status: 410 }
  );
}
