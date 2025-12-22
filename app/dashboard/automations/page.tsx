"use client";

import useSWR from "swr";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { useState } from "react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function AutomationsPage() {
  const { data: flows, mutate, isLoading } = useSWR("/api/automation", fetcher);
  const [status, setStatus] = useState<string | null>(null);

  const formatPlan = (value?: string) => {
    switch ((value || "").toLowerCase()) {
      case "starter":
        return "Starter";
      case "pro":
        return "Pro";
      case "enterprise":
        return "Enterprise";
      default:
        return value || "Upgrade";
    }
  };

  const runFlow = async (id: string) => {
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        body: JSON.stringify({ flowId: id, input: { text: "Run from dashboard" } }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.type === "upgrade_required") {
          setStatus(`${json.reason || "Upgrade required."} Required plan: ${formatPlan(json.requiredPlan)}.`);
        } else if (json.type === "limit_reached") {
          setStatus(`${json.reason || "Limit reached."} Required plan: ${formatPlan(json.requiredPlan)}.`);
        } else {
          setStatus(json.reason || json.error || "Could not run automation.");
        }
      } else {
        setStatus(null);
      }
    } catch {
      setStatus("Could not run automation. Please try again.");
    }
    mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Automations</p>
          <h1 className="text-3xl font-semibold text-foreground">Your flows</h1>
        </div>
        <Link href="/dashboard/automations/new">
          <Button>Create automation</Button>
        </Link>
      </div>
      {status && <Alert variant="info">{status}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
        {flows?.map((flow: any) => (
          <Card
            key={flow.id}
            title={flow.title}
            actions={<Badge variant="default">{flow.status}</Badge>}
          >
            <p className="text-sm text-muted-foreground">{flow.description}</p>
            <div className="mt-3 flex gap-2">
              <Link href={`/dashboard/automations/${flow.id}`}>
                <Button size="sm" variant="secondary">
                  Details
                </Button>
              </Link>
              <Button size="sm" variant="ghost" onClick={() => runFlow(flow.id)}>
                Run
              </Button>
            </div>
          </Card>
        ))}
        {flows?.length === 0 && (
          <EmptyState
            title="No automations yet"
            description="Create your first automation flow to start orchestrating tasks."
            actionLabel="Create automation"
            onAction={() => (window.location.href = "/dashboard/automations/new")}
          />
        )}
      </div>
    </div>
  );
}
