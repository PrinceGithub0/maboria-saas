import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { enforceEntitlement } from "@/lib/entitlements";
import { getPaymentsLedgerData } from "@/lib/billing/payments-ledger";
import { requireBillingAccess } from "@/lib/permissions";
import { requireSystemFlag } from "@/lib/system-flags-guard";

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  const exportsDisabled = await requireSystemFlag("exports_enabled", "Exports are currently disabled.");
  if (exportsDisabled) return exportsDisabled;

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
  const data = await getPaymentsLedgerData({
    userId: access.ownerUserId,
    range: searchParams.get("range"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    status: searchParams.get("status"),
    query: searchParams.get("q"),
    page: 1,
    pageSize: 500,
  });

  const rows = [
    ["Date", "Customer Name", "Customer Contact", "Invoice", "Amount", "Currency", "Method", "Status", "Reference"],
    ...data.rows.map((row) => [
      new Date(row.createdAt).toISOString(),
      row.customerName,
      row.customerContact,
      row.invoiceNumber,
      String(row.amount),
      row.currency,
      row.method,
      row.status,
      row.reference,
    ]),
  ];

  const csv = `${rows
    .map((row) => row.map((value) => csvEscape(String(value))).join(","))
    .join("\n")}\n`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="payments-ledger.csv"',
      "Cache-Control": "no-store",
    },
  });
}
