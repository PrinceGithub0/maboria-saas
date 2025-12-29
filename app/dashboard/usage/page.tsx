"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { Table } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function UsagePage() {
  const { data: usage, isLoading } = useSWR("/api/usage", fetcher);
  const { data: aiLogs } = useSWR("/api/ai/usage", fetcher);

  const aiLogList = Array.isArray(aiLogs) ? aiLogs : [];
  const chartData = aiLogList
    .slice(0, 12)
    .map((log: any, idx: number) => ({ name: idx.toString(), value: log.tokens }));

  return (
    <div className="space-y-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Usage</p>
          <h1 className="text-3xl font-semibold text-foreground">Analytics</h1>
        </div>
      </div>
      <Card title="AI token usage">
        <MiniAreaChart data={chartData} />
      </Card>
      <Card title="Usage records">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : usage?.length ? (
          <Table
            data={usage || []}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "category", label: "Category" },
              { key: "amount", label: "Amount" },
              { key: "period", label: "Period" },
              {
                key: "createdAt",
                label: "Date",
                render: (row: any) => new Date(row.createdAt).toLocaleDateString(),
              },
            ]}
          />
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
