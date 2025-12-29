"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminLogsPage() {
  const { data: activity, isLoading: loadingActivity } = useSWR("/api/admin/logs/activity", fetcher);
  const { data: webhooks, isLoading: loadingWebhooks } = useSWR("/api/admin/logs/webhooks", fetcher);

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground">System logs</h1>
        </div>
      </div>
      <Tabs
        tabs={[
          {
            id: "activity",
            label: "Activity",
            content: (
              <Card title="Activity logs">
                {loadingActivity ? (
                  <Skeleton className="h-24" />
                ) : (
                  <Table
                    data={activity || []}
                    keyExtractor={(row: any) => row.id}
                    columns={[
                      { key: "action", label: "Action" },
                      { key: "userId", label: "User" },
                      {
                        key: "timestamp",
                        label: "Time",
                        render: (row: any) => new Date(row.timestamp).toLocaleString(),
                      },
                    ]}
                  />
                )}
              </Card>
            ),
          },
          {
            id: "webhooks",
            label: "Webhooks",
            content: (
              <Card title="Webhook logs">
                {loadingWebhooks ? (
                  <Skeleton className="h-24" />
                ) : (
                  <Table
                    data={webhooks || []}
                    keyExtractor={(row: any) => row.id}
                    columns={[
                      { key: "provider", label: "Provider", render: () => "Flutterwave/Paystack" },
                      { key: "status", label: "Status" },
                      { key: "reference", label: "Reference" },
                      {
                        key: "createdAt",
                        label: "Time",
                        render: (row: any) => new Date(row.createdAt).toLocaleString(),
                      },
                      {
                        key: "actions",
                        label: "Actions",
                        render: (row: any) => (
                          <div className="flex gap-2">
                            <button
                              className="text-xs text-indigo-600 dark:text-indigo-300"
                              onClick={() => fetch(`/api/admin/webhooks/${row.id}/replay`, { method: "POST" })}
                            >
                              Replay
                            </button>
                            <button
                              className="text-xs text-emerald-700 dark:text-emerald-300"
                              onClick={() => fetch(`/api/admin/webhooks/${row.id}/resolve`, { method: "POST" })}
                            >
                              Resolve
                            </button>
                            <button
                              className="text-xs text-muted-foreground"
                              onClick={() => fetch(`/api/admin/webhooks/${row.id}/archive`, { method: "POST" })}
                            >
                              Archive
                            </button>
                          </div>
                        ),
                      },
                    ]}
                  />
                )}
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
