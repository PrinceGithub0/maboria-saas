"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminMetricsPage() {
  const { data, isLoading } = useSWR("/api/admin/revenue", fetcher);

  const usdCents = Number(data?.revenueByCurrency?.find((r: any) => r.currency === "USD")?._sum.amount || 0);
  const ngnAmount = Number(data?.revenueByCurrency?.find((r: any) => r.currency === "NGN")?._sum.amount || 0);

  return (
    <div className="space-y-6 px-6 py-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground">Engine metrics</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
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
              <p className="text-3xl font-semibold text-foreground">${(usdCents / 100).toFixed(2)}</p>
            </Card>
            <Card title="Revenue (NGN)">
              <p className="text-3xl font-semibold text-foreground">
                {"\u20A6"}
                {ngnAmount.toLocaleString()}
              </p>
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
              { key: "currency", label: "Currency" },
              {
                key: "_sum",
                label: "Amount",
                render: (row: any) =>
                  row.currency === "NGN"
                    ? `\u20A6${Number(row._sum.amount || 0).toLocaleString()}`
                    : `$${(Number(row._sum.amount || 0) / 100).toFixed(2)}`,
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

