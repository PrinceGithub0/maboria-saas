"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/currency";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminMetricsPage() {
  const { data, isLoading } = useSWR("/api/admin/revenue", fetcher);

  const usdAmount = Number(data?.revenueByCurrency?.find((r: any) => r.currency === "USD")?.amount || 0);
  const ngnAmount = Number(data?.revenueByCurrency?.find((r: any) => r.currency === "NGN")?.amount || 0);

  return (
    <div className="space-y-6 px-6 py-6 max-md:px-4 max-md:py-4 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground">Engine metrics</h1>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 max-md:grid-cols-1 max-md:gap-5">
        {isLoading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            <Card title="Active subs">
              <p className="text-3xl font-semibold text-foreground">{data?.activeSubs ?? 0}</p>
            </Card>
            <Card title="Trials">
              <p className="text-3xl font-semibold text-foreground">{data?.trials ?? 0}</p>
            </Card>
            <Card title="Revenue (USD)">
              <p className="text-3xl font-semibold text-foreground">{formatCurrency(usdAmount, "USD")}</p>
            </Card>
            <Card title="Revenue (NGN)">
              <p className="text-3xl font-semibold text-foreground">{formatCurrency(ngnAmount, "NGN")}</p>
            </Card>
          </>
        )}
      </div>

      <Card title="Churn/failures">
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <MiniAreaChart
            data={[
              { name: "Fail", value: data?.failedPayments || 0 },
              { name: "Active", value: data?.activeSubs || 0 },
            ]}
          />
        )}
      </Card>

      <Card title="Revenue by currency">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <Table
            data={data?.revenueByCurrency || []}
            keyExtractor={(row: any) => row.currency}
            columns={[
              {
                key: "currency",
                label: "Currency",
                render: (row: any) => String(row.currency || "").toUpperCase(),
              },
              {
                key: "amount",
                label: "Amount",
                render: (row: any) => formatCurrency(Number(row.amount || 0), row.currency),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
