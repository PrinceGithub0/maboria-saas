import "server-only";

import { NextResponse } from "next/server";
import { isEnabledAsync, type SystemFlag } from "@/lib/system-flags";

export async function requireSystemFlag(
  flag: SystemFlag,
  options?: string | { message?: string; status?: number }
): Promise<NextResponse | null> {
  const enabled = await isEnabledAsync(flag);
  if (enabled) return null;
  const message = typeof options === "string" ? options : options?.message;
  const status = typeof options === "object" && options ? options.status : undefined;
  return NextResponse.json(
    {
      error: message || "Feature is disabled by system flag.",
      code: "SYSTEM_FLAG_DISABLED",
      flag,
    },
    { status: status ?? 503 }
  );
}
