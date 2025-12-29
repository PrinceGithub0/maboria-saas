"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminNotificationsPage() {
  const { data, isLoading } = useSWR("/api/notifications", fetcher);

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground">Notifications</h1>
        </div>
      </div>
      <Card title="System alerts">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <Table
            data={data || []}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "type", label: "Type" },
              { key: "message", label: "Message" },
              {
                key: "createdAt",
                label: "Time",
                render: (row: any) => new Date(row.createdAt).toLocaleString(),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
