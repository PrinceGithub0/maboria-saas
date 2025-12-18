"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AutomationErrorsPage() {
  const { data, isLoading, mutate } = useSWR("/api/admin/automation/errors", fetcher);

  const replay = async (id: string) => {
    await fetch("/api/admin/automation/replay", {
      method: "POST",
      body: JSON.stringify({ runId: id }),
    });
    mutate();
  };

  return (
    <div className="space-y-4 px-6 py-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Admin</p>
        <h1 className="text-3xl font-semibold text-white">Automation errors</h1>
      </div>
      <Card>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <Table
            data={data || []}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "flow", label: "Flow", render: (row: any) => row.flow?.title },
              { key: "user", label: "User", render: (row: any) => row.user?.email },
              { key: "runStatus", label: "Status" },
              {
                key: "createdAt",
                label: "Created",
                render: (row: any) => new Date(row.createdAt).toLocaleString(),
              },
              {
                key: "actions",
                label: "Actions",
                render: (row: any) => (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => replay(row.id)}>
                      Replay
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
