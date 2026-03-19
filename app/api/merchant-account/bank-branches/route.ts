import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { listFlutterwaveBankBranches } from "@/lib/payments/flutterwave";
import { requireBillingAccess } from "@/lib/permissions";
import { requireSystemFlag } from "@/lib/system-flags-guard";

export const GET = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const paymentsDisabled = await requireSystemFlag("payments_enabled", "Payments are currently disabled.");
    if (paymentsDisabled) return paymentsDisabled;

    const access = await requireBillingAccess(session.user.id);
    if (!access.ok) return NextResponse.json({ error: access.message }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const bankId = String(searchParams.get("bankId") || "").trim();

    if (!bankId) {
      return NextResponse.json({ error: "Bank ID is required." }, { status: 400 });
    }

    const response = await listFlutterwaveBankBranches(bankId);
    const branches = (response?.data || []).map((branch: any) => ({
      id: branch.id ?? null,
      name: branch.branch_name || branch.name || branch.branch || branch.code || "Branch",
      code: branch.branch_code || branch.code || branch.id || "",
    }));

    return NextResponse.json({ branches });
  })
);
