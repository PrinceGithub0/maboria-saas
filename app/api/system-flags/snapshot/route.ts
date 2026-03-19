import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";
import { getAllFlagsAsync } from "@/lib/system-flags";

const INTERNAL_HEADER = "x-system-flags-internal";

export const GET = withErrorHandling(async (req: Request) => {
  const expectedToken = process.env.SYSTEM_FLAGS_SNAPSHOT_TOKEN || process.env.NEXTAUTH_SECRET || "";
  if (expectedToken) {
    const providedToken = req.headers.get(INTERNAL_HEADER) || "";
    if (providedToken !== expectedToken) {
      return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }
  }

  const flags = await getAllFlagsAsync();
  return NextResponse.json({ flags });
});
