"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SubscriptionPage() {
  const { data, mutate } = useSWR("/api/subscription", fetcher);
  const subs = data || [];

  const formatPlan = (plan: string) => {
    switch ((plan || "").toUpperCase()) {
      case "STARTER":
        return "Starter";
      case "GROWTH":
      case "PREMIUM":
        return "Pro";
      case "ENTERPRISE":
        return "Enterprise";
      default:
        return plan;
    }
  };

  const openPortal = async () => {
    const res = await fetch("/api/payments/stripe/portal", { method: "POST" });
    const json = await res.json();
    if (json.url) window.location.href = json.url;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Subscription</p>
          <h1 className="text-3xl font-semibold text-foreground">Manage plan</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => mutate()}>Refresh</Button>
          <Button variant="secondary" onClick={openPortal}>
            Billing portal
          </Button>
        </div>
      </div>
      <Card title="Current plan">
        {subs.length === 0 ? (
          <Alert variant="info">No subscription yet.</Alert>
        ) : (
          <Table
            data={subs}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "plan", label: "Plan", render: (row: any) => formatPlan(row.plan) },
              { key: "status", label: "Status" },
              {
                key: "renewalDate",
                label: "Renews",
                render: (row: any) => new Date(row.renewalDate).toLocaleDateString(),
              },
              { key: "usageLimit", label: "Usage limit" },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
