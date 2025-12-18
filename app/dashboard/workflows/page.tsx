"use client";

import useSWR from "swr";
import { WorkflowBuilder } from "@/components/workflows/builder";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function WorkflowsPage() {
  const { data: workflows, mutate } = useSWR("/api/workflows", fetcher);

  const save = async (payload: any) => {
    await fetch("/api/workflows", { method: "POST", body: JSON.stringify(payload) });
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

