import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { isPlatformRole } from "@/lib/global-role";
import { prisma } from "@/lib/prisma";
import { applyPendingDowngrades } from "@/lib/subscription-downgrade";

async function authorize(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get("x-cron-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (cronSecret && (headerSecret === cronSecret || bearer === cronSecret)) {
    return { ok: true as const, source: "cron" as const, userId: null as string | null };
  }

  const session = await getServerSession(authOptions);
  if (isPlatformRole(session?.user?.role)) {
    return { ok: true as const, source: "admin" as const, userId: session?.user?.id ?? null };
  }

  return { ok: false as const, source: "denied" as const, userId: null as string | null };
}

async function run(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await applyPendingDowngrades(new Date());
    await prisma.activityLog.create({
      data: {
        userId: auth.userId,
        action: "SUBSCRIPTION_PENDING_DOWNGRADES_APPLIED",
        metadata: {
          source: auth.source,
          applied: result.applied,
          skippedProviderManaged: result.skippedProviderManaged,
        },
      },
    });
    return NextResponse.json({ ok: true, source: auth.source, result });
  } catch (error) {
    console.error("subscription_pending_downgrades_failed", error);
    return NextResponse.json({ error: "Pending downgrades failed." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

export const dynamic = "force-dynamic";
