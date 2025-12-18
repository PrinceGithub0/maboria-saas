"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function PrelaunchPage() {
  const { data, isLoading } = useSWR("/api/admin/prelaunch", fetcher);
  return (
    <div className="space-y-4 px-6 py-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground">Pre-launch checklist</h1>
      </div>
      <Card title="Checklist">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <Table
            data={data || []}
            keyExtractor={(row: any) => row.item}
            columns={[
              { key: "item", label: "Item" },
              { key: "status", label: "Status" },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
