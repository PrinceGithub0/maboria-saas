"use client";

import useSWR from "swr";
import { Activity, FileText, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { Table } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function UsagePage() {
  const { data: usage, isLoading } = useSWR("/api/usage", fetcher);
  const { data: aiLogs } = useSWR("/api/ai/usage", fetcher);

  const usageList = Array.isArray(usage) ? usage : [];
  const usageSorted = [...usageList].sort((a: any, b: any) => {
    const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  const aiLogList = Array.isArray(aiLogs) ? aiLogs : [];
  const hasTokenData = aiLogList.some(
    (log: any) => typeof log.tokens === "number" && log.tokens > 0
  );
  const aiByDay = new Map<string, number>();
  for (const log of aiLogList) {
    const dateKey = log?.createdAt
      ? new Date(log.createdAt).toISOString().slice(0, 10)
      : "unknown";
    const increment = hasTokenData ? Number(log.tokens || 0) : 1;
    aiByDay.set(dateKey, (aiByDay.get(dateKey) || 0) + increment);
  }
  const sortedEntries = Array.from(aiByDay.entries())
    .filter(([key]) => key !== "unknown")
    .sort((a, b) => a[0].localeCompare(b[0]));
  const unknownEntry = aiByDay.has("unknown")
    ? ([["unknown", aiByDay.get("unknown") ?? 0]] as [string, number][])
    : [];
  const orderedEntries = [...sortedEntries, ...unknownEntry];
  const limitedEntries =
    orderedEntries.length > 12 ? orderedEntries.slice(-12) : orderedEntries;
  const formatDayLabel = (key: string) => {
    if (key === "unknown") return "";
    const parts = key.split("-");
    if (parts.length !== 3) return key;
    return `${parts[2]}-${parts[1]}`;
  };
  const rawChartData = limitedEntries.map(([key, value], idx) => ({
    name: key === "unknown" ? idx.toString() : formatDayLabel(key),
    value,
  }));
  const fallbackChartData = Array.from({ length: 12 }, (_, idx) => {
    const date = new Date();
    date.setDate(date.getDate() - (11 - idx));
    const iso = date.toISOString().slice(0, 10);
    return { name: formatDayLabel(iso), value: 0 };
  });
  const chartData = rawChartData.length > 0 ? rawChartData : fallbackChartData;
  const aiHasData = rawChartData.some((point) => Number(point.value) > 0);
  const aiError =
    !Array.isArray(aiLogs) && aiLogs && typeof aiLogs === "object" && "error" in aiLogs;
  const showingRequestActivity = aiLogList.length > 0 && !hasTokenData;
  const aiValues = chartData.map((point) => Number(point.value) || 0);
  const totalAi = aiValues.reduce((sum, value) => sum + value, 0);
  const avgAi = aiValues.length ? Math.round(totalAi / aiValues.length) : 0;
  const peakPoint = chartData.reduce(
    (best, point) => (Number(point.value) > Number(best.value) ? point : best),
    chartData[0] || { name: "--", value: 0 }
  );
  const peakLabel = peakPoint.name || "--";
  const formatNumber = (value: number) => new Intl.NumberFormat().format(value);
  const unitLabel = hasTokenData ? "tokens" : "requests";
  const formatDate = (value?: string | Date) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };
  const latestUsageDate = usageSorted.length ? usageSorted[0]?.createdAt : undefined;

  const normalizeCategory = (value?: string) => (value || "").toLowerCase();
  const categoryKey = (value?: string) => {
    const normalized = normalizeCategory(value);
    if (normalized.includes("automation")) return "automation";
    if (normalized.includes("invoice")) return "invoice";
    if (normalized.includes("ai")) return "ai";
    return "other";
  };
  const latestByCategory = new Map<string, any>();
  const totalsByCategory = new Map<string, number>();
  for (const row of usageSorted) {
    const key = categoryKey(row?.category);
    const amount = Number(row?.amount || 0);
    totalsByCategory.set(key, (totalsByCategory.get(key) || 0) + amount);
    if (!latestByCategory.has(key)) {
      latestByCategory.set(key, row);
    }
  }
  const usageHighlights = [
    {
      key: "automation",
      label: "Automation runs",
      total: Number(totalsByCategory.get("automation") || 0),
      latest: Number(latestByCategory.get("automation")?.amount || 0),
      period: latestByCategory.get("automation")?.period || "--",
      icon: Activity,
    },
    {
      key: "invoice",
      label: "Invoices",
      total: Number(totalsByCategory.get("invoice") || 0),
      latest: Number(latestByCategory.get("invoice")?.amount || 0),
      period: latestByCategory.get("invoice")?.period || "--",
      icon: FileText,
    },
    {
      key: "ai",
      label: "AI requests",
      total: Number(totalsByCategory.get("ai") || 0),
      latest: Number(latestByCategory.get("ai")?.amount || 0),
      period: latestByCategory.get("ai")?.period || "--",
      icon: Sparkles,
    },
  ];

  return (
    <div className="space-y-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            Usage
          </p>
          <h1 className="text-3xl font-semibold text-foreground">Analytics</h1>
        </div>
      </div>
      <Card title="AI token usage" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-background/60 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="text-lg font-semibold text-foreground">
              {formatNumber(totalAi)} {unitLabel}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/60 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Average per day
            </p>
            <p className="text-lg font-semibold text-foreground">
              {formatNumber(avgAi)} {unitLabel}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/60 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Peak day</p>
            <p className="text-lg font-semibold text-foreground">
              {peakLabel} - {formatNumber(Number(peakPoint.value) || 0)} {unitLabel}
            </p>
          </div>
        </div>
        <MiniAreaChart data={chartData} className="min-h-[180px]" />
        {aiError && (
          <p className="mt-3 text-xs text-muted-foreground">
            AI usage is unavailable. Upgrade to Pro to unlock AI usage metrics.
          </p>
        )}
        {showingRequestActivity && (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing AI request activity because token totals are unavailable.
          </p>
        )}
        {!aiError && !aiHasData && (
          <p className="mt-3 text-xs text-muted-foreground">
            No AI usage yet. Run the AI assistant to generate token usage data.
          </p>
        )}
      </Card>
      <Card
        title="Usage records"
        className="space-y-4"
        actions={
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground">
              Total: {formatNumber(usageSorted.length)}
            </span>
            <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground">
              Last update: {formatDate(latestUsageDate)}
            </span>
          </div>
        }
      >
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : usageSorted.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {usageHighlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="text-lg font-semibold text-foreground">
                        {formatNumber(item.total)}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Latest: {formatNumber(item.latest)} · {item.period}
                      </p>
                    </div>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/80 text-indigo-500">
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>
                );
              })}
            </div>
            <Table
              data={usageSorted}
              keyExtractor={(row: any) => row.id}
              columns={[
                {
                  key: "category",
                  label: "Category",
                  render: (row: any) => (
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-semibold text-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      {row.category || "Unknown"}
                    </span>
                  ),
                },
                {
                  key: "amount",
                  label: "Amount",
                  render: (row: any) => (
                    <span className="text-sm font-semibold text-foreground">
                      {formatNumber(Number(row.amount) || 0)}
                    </span>
                  ),
                },
                {
                  key: "period",
                  label: "Period",
                  render: (row: any) => (
                    <span className="rounded-full border border-border/70 bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                      {row.period || "Unknown"}
                    </span>
                  ),
                },
                {
                  key: "createdAt",
                  label: "Date",
                  render: (row: any) => formatDate(row.createdAt),
                },
              ]}
            />
          </>
        ) : (
          <EmptyState
            title="No usage yet"
            description="Run automations and AI to see usage metrics here."
          />
        )}
      </Card>
    </div>
  );
}
