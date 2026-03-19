import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getSubscriberDashboardData } from "@/lib/dashboard/subscriber-data";
import { requireOrgPermission } from "@/lib/org-auth";
import { isPlanAtLeast, subscriptionPlanToUserPlan } from "@/lib/entitlements";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "settings:business:read",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const payload = await getSubscriberDashboardData({
    userId: session.user.id,
    range: searchParams.get("range"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    scope: {
      orgId: access.context.orgId,
      ownerUserId: access.context.ownerUserId,
      canAI: access.context.orgPlan
        ? isPlanAtLeast(subscriptionPlanToUserPlan(access.context.orgPlan), "starter")
        : false,
    },
  });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
