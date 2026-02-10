import "server-only";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { assertRateLimit } from "@/lib/rate-limit";
import { scheduleDowngrade } from "@/lib/subscription-downgrade";
import { z } from "zod";

const schema = z.object({
  plan: z.enum(["STARTER", "PRO", "GROWTH", "BUSINESS"]),
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  assertRateLimit(`sub:down:${session.user.id}`, 6, 60_000);
  const { plan } = schema.parse(await req.json());
  const result = await scheduleDowngrade(session.user.id, plan);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
});
