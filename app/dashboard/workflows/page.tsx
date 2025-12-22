"use client";

import useSWR from "swr";
import { WorkflowBuilder } from "@/components/workflows/builder";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { useState } from "react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function WorkflowsPage() {
  const { data: workflows, mutate } = useSWR("/api/workflows", fetcher);
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

  const save = async (payload: any) => {
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.type === "upgrade_required") {
          setStatus(`${json.reason || "Upgrade required."} Required plan: ${formatPlan(json.requiredPlan)}.`);
        } else if (json.type === "limit_reached") {
          setStatus(`${json.reason || "Limit reached."} Required plan: ${formatPlan(json.requiredPlan)}.`);
        } else {
          setStatus(json.reason || json.error || "Could not save workflow.");
        }
      } else {
        setStatus(null);
      }
    } catch {
      setStatus("Could not save workflow. Please try again.");
    }
    mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Workflows</p>
          <h1 className="text-3xl font-semibold text-foreground">{"Triggers \u2192 Actions"}</h1>
        </div>
        <Badge variant="success">Drag &amp; drop ready</Badge>
      </div>
      {status && <Alert variant="info">{status}</Alert>}

      <WorkflowBuilder onSave={save} />

      <div className="grid gap-4 md:grid-cols-2">
        {workflows?.map((wf: any) => (
          <Card key={wf.id} title={wf.title} actions={<Badge>{wf.status}</Badge>}>
            <p className="text-sm text-muted-foreground">{wf.description}</p>
            <p className="text-xs text-muted-foreground">
              {wf.triggers.length} triggers {"\u2022"} {wf.actions.length} actions
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary">
                Edit
              </Button>
              <Button size="sm" variant="ghost">
                Run now
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
