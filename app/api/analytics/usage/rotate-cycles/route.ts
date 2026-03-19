import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isPlatformRole } from "@/lib/global-role";
import { rotateUsageCycles } from "@/lib/usage/jobs";

async function authorize(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get("x-cron-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (cronSecret && (headerSecret === cronSecret || bearer === cronSecret)) {
    return { ok: true as const };
  }
  const session = await getServerSession(authOptions);
  if (isPlatformRole(session?.user?.role)) return { ok: true as const };
  return { ok: false as const };
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await rotateUsageCycles();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("usage_cycle_rotation_failed", error);
    return NextResponse.json({ error: "Cycle rotation failed." }, { status: 500 });
  }
}
