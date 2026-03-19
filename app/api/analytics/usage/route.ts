import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUsageReportSnapshot, resolveUsageReportAccess } from "@/lib/usage/report";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cycle = (searchParams.get("cycle") || "current").toLowerCase();
  if (cycle !== "current") {
    return NextResponse.json({ error: "Only cycle=current is supported." }, { status: 400 });
  }

  try {
    const access = await resolveUsageReportAccess(session.user.id);
    if (!access) {
      return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
    }
    if (access.orgAccessStatus !== "ACTIVE") {
      return NextResponse.json({ error: "Organization access is not active." }, { status: 403 });
    }
    if (access.orgSubscriptionStatus !== "ACTIVE") {
      return NextResponse.json({ error: "Organization subscription inactive." }, { status: 403 });
    }

    const snapshot = await getUsageReportSnapshot(session.user.id, access);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("usage_snapshot_failed", error);
    return NextResponse.json(
      { error: "Unable to load usage metrics right now. Please refresh." },
      { status: 500 }
    );
  }
}
