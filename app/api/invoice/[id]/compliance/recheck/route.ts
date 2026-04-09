import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { requireBillingAccess } from "@/lib/permissions";
import { recheckDraftInvoiceCompliance } from "@/lib/invoice";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export const POST = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireBillingAccess(session.user.id);
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entitlement = await enforceEntitlement(access.ownerUserId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json({ error: "Access denied", reason: entitlement.reason }, { status: 403 });
  }

  const { id } = await params;
  const result = await recheckDraftInvoiceCompliance({
    userId: access.ownerUserId,
    invoiceId: id,
  });

  return NextResponse.json(result);
});
