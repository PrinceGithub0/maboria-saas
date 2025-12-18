"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function RunsPage() {
  const { data: runs } = useSWR("/api/automation/runs", fetcher);

  const restart = async (flowId: string) => {
    await fetch("/api/automation/run", {
      method: "POST",
      body: JSON.stringify({ flowId, input: { text: "Restarted from run viewer" } }),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Automation</p>
        <h1 className="text-3xl font-semibold text-foreground">Runs</h1>
      </div>
      <Card>
        <Table
          data={runs || []}
          keyExtractor={(row: any) => row.id}
          columns={[
            { key: "flow", label: "Flow", render: (row: any) => row.flow?.title },
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
                <Button size="sm" variant="ghost" onClick={() => restart(row.flowId)}>
                  Restart
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
