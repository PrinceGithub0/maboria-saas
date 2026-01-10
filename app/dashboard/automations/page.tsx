"use client";

import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { useState } from "react";
import { useRouter } from "next/navigation";

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || "Failed to load automations");
    (error as any).status = res.status;
    (error as any).data = data;
    throw error;
  }
  return data;
};

export default function AutomationsPage() {
  const router = useRouter();
  const { data: flows, error: flowsError, mutate, isLoading } = useSWR("/api/automation", fetcher);
  const [status, setStatus] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

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
    setRunningId(id);
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        setStatus("Automation run started.");
      }
    } catch {
      setStatus("Could not run automation. Please try again.");
    } finally {
      setRunningId(null);
    }
    mutate();
  };

  const flowList = Array.isArray(flows) ? flows : [];

  return (
    <div className="space-y-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between max-md:flex-col max-md:items-start max-md:gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Automations</p>
            <h1 className="text-3xl font-semibold text-foreground">Your flows</h1>
          </div>
          <Button className="max-md:w-full" onClick={() => router.push("/dashboard/automations/new")}>
            Create automation
          </Button>
        </div>
        {status && <div className="mt-4"><Alert variant="info">{status}</Alert></div>}
      </div>
      <div className="grid gap-4 md:grid-cols-2 max-md:gap-5">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
        {flowsError && (
          <Alert variant="error">
            {(flowsError as any)?.data?.reason ||
              (flowsError as any)?.data?.error ||
              "Unable to load automations."}
          </Alert>
        )}
        {flowList.map((flow: any) => (
          <Card
            key={flow.id}
            title={flow.title}
            actions={<Badge variant="default">{flow.status}</Badge>}
          >
            <p className="text-sm text-muted-foreground">{flow.description}</p>
            <div className="mt-3 flex gap-2 max-md:flex-col max-md:items-stretch">
              <Button
                size="sm"
                variant="secondary"
                className="max-md:w-full"
                onClick={() => router.push(`/dashboard/automations/${flow.id}`)}
                type="button"
              >
                Details
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="max-md:w-full"
                onClick={() => runFlow(flow.id)}
                loading={runningId === flow.id}
                disabled={runningId === flow.id}
                type="button"
              >
                Run
              </Button>
            </div>
          </Card>
        ))}
        {flowList.length === 0 && (
          <EmptyState
            title="No automations yet"
            description="Create your first automation flow to start orchestrating tasks."
            actionLabel="Create automation"
            onAction={() => router.push("/dashboard/automations/new")}
          />
        )}
      </div>
    </div>
  );
}
