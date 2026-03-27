import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { getAdminEngineMetrics, parseEngineRange } from "@/lib/admin/engine-metrics";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";
import { requireSystemFlag } from "@/lib/system-flags-guard";

function csvEscape(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function buildCsv(metrics: Awaited<ReturnType<typeof getAdminEngineMetrics>>) {
  const rows: string[] = [];
  rows.push(["Section", "Metric", "Value", "Notes"].map(csvEscape).join(","));
  rows.push(["Header", "Engine Status", metrics.engineStatus.label, "Computed health signal"].map(csvEscape).join(","));
  rows.push(["Primary KPIs", "Active Subscribers", metrics.kpis.activeSubscribers.value, "Current"].map(csvEscape).join(","));
  rows.push(["Primary KPIs", "MRR (USD)", metrics.kpis.mrrUsd.value, "Monthly recurring revenue"].map(csvEscape).join(","));
  rows.push(["Primary KPIs", "30-Day Growth %", metrics.kpis.growth30d.value, "Last 30 days"].map(csvEscape).join(","));
  rows.push(["Primary KPIs", "Churn Rate (30d) %", metrics.kpis.churnRate30d.value, "Last 30 days"].map(csvEscape).join(","));
  rows.push(["Primary KPIs", "Failed Payments (30d)", metrics.kpis.failedPayments30d.value, "Last 30 days"].map(csvEscape).join(","));
  rows.push(["Revenue", `Revenue (${metrics.range.toUpperCase()}) USD`, metrics.revenue.currentRangeRevenueUsd, "Selected window"].map(csvEscape).join(","));
  rows.push(["Revenue", "Net Revenue Delta USD", metrics.revenue.netRevenueDeltaUsd, "Selected vs previous window"].map(csvEscape).join(","));
  rows.push(["Revenue", "Growth %", metrics.revenue.growthPercent, "Selected vs previous window"].map(csvEscape).join(","));
  rows.push(["Revenue", "New Revenue USD", metrics.revenue.mrrMovement.newRevenueUsd, "Current range"].map(csvEscape).join(","));
  rows.push(["Revenue", "Churned Revenue USD", metrics.revenue.mrrMovement.churnedRevenueUsd, "Current range"].map(csvEscape).join(","));
  rows.push(["Revenue", "Downgrade Revenue USD", metrics.revenue.mrrMovement.downgradeRevenueUsd, "Current range"].map(csvEscape).join(","));
  rows.push(["Revenue", "Net MRR Change USD", metrics.revenue.mrrMovement.netChangeUsd, "Current range"].map(csvEscape).join(","));
  rows.push(["Churn & Rétention", "Subscribers at Risk", metrics.churnRetention.subscribersAtRisk, "Current"].map(csvEscape).join(","));
  rows.push(["Churn & Rétention", "Voluntary Churn %", metrics.churnRetention.voluntaryChurnRate30d, "Last 30 days"].map(csvEscape).join(","));
  rows.push(["Churn & Rétention", "Involuntary Churn %", metrics.churnRetention.involuntaryChurnRate30d, "Payment failures"].map(csvEscape).join(","));
  rows.push(["Churn & Rétention", "Rétention Rate %", metrics.churnRetention.retentionRate30d, "Last 30 days"].map(csvEscape).join(","));
  rows.push(["Payment Health", "Failed Charges (7d)", metrics.paymentHealth.failedCharges7d, "Last 7 days"].map(csvEscape).join(","));
  rows.push(["Payment Health", "Retry Success Rate %", metrics.paymentHealth.retrySuccessRate7d, "Last 7 days"].map(csvEscape).join(","));
  rows.push(["Payment Health", "Retry Success Rate Delta %", metrics.paymentHealth.retrySuccessRateDelta.deltaPercent, "Vs previous period"].map(csvEscape).join(","));
  rows.push(["Payment Health", "Collection Rate %", metrics.paymentHealth.collectionRate30d, "Last 30 days"].map(csvEscape).join(","));
  rows.push(["Payment Health", "Collection Rate Delta %", metrics.paymentHealth.collectionRateDelta.deltaPercent, "Vs previous period"].map(csvEscape).join(","));
  rows.push(["Payment Health", "Subscription Refund Rate (30d) %", metrics.paymentHealth.refundRate30d, "Last 30 days"].map(csvEscape).join(","));
  rows.push(["Payment Health", "Subscription Refund Rate Delta %", metrics.paymentHealth.refundRateDelta.deltaPercent, "Vs previous period"].map(csvEscape).join(","));

  for (const provider of metrics.paymentHealth.providers) {
    rows.push(
      ["Payment Provider", `${provider.name} status`, provider.status, `${provider.failureRate}% failure rate`]
        .map(csvEscape)
        .join(",")
    );
  }

  rows.push("");
  rows.push(["Revenue by Plan", "Plan", "Subscribers", "MRR (USD)", "% of Revenue"].map(csvEscape).join(","));
  for (const row of metrics.revenueByPlan) {
    rows.push(
      ["Revenue by Plan", row.plan, row.subscribers, row.mrrUsd, row.sharePercent]
        .map(csvEscape)
        .join(",")
    );
  }

  rows.push("");
  rows.push(["Advanced", "ARPU USD", metrics.advanced.arpuUsd, "Current active base"].map(csvEscape).join(","));
  rows.push(
    ["Advanced", "LTV USD", metrics.advanced.ltvLabel || metrics.advanced.ltvUsd, metrics.advanced.ltvLabel ? "Strong retention status" : "Based on churn rate"]
      .map(csvEscape)
      .join(",")
  );
  rows.push(
    ["Advanced", "Avg Subscription Duration (months)", metrics.advanced.averageSubscriptionDurationMonths, "Active subscribers"]
      .map(csvEscape)
      .join(",")
  );

  return rows.join("\n");
}

export const GET = withErrorHandling(async (req: Request) => {
  const exportsDisabled = await requireSystemFlag("exports_enabled", "Exports are currently disabled.");
  if (exportsDisabled) return exportsDisabled;

  const session = await getServerSession(authOptions);
  const denied = requirePlatformAdmin(session?.user);
  if (denied) return denied;
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session!.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const { searchParams } = new URL(req.url);
  const range = parseEngineRange(searchParams.get("range"));
  const metrics = await getAdminEngineMetrics(range);
  const csv = buildCsv(metrics);
  const filename = `engine-metrics-${range}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
