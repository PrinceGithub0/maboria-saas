import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getInfrastructureDashboardData } from "@/lib/dashboard/control-data";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const payload = await getInfrastructureDashboardData({
    userId: session.user.id,
    role: session.user.role,
    range,
    from,
    to,
  });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
