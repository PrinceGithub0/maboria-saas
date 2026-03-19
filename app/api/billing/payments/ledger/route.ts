import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { enforceEntitlement } from "@/lib/entitlements";
import { getPaymentsLedgerData } from "@/lib/billing/payments-ledger";
import { requireBillingAccess } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireBillingAccess(session.user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: 403 });
  }

  const entitlement = await enforceEntitlement(access.ownerUserId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Access denied",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const payload = await getPaymentsLedgerData({
    userId: access.ownerUserId,
    range: searchParams.get("range"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    status: searchParams.get("status"),
    query: searchParams.get("q"),
    page: Number(searchParams.get("page") || 1),
    pageSize: Number(searchParams.get("pageSize") || 20),
  });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
