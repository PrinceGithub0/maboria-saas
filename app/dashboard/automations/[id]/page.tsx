"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function AutomationDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;
  const { data: flow, isLoading } = useSWR(id ? `/api/automation/${id}` : null, fetcher);
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

  const runFlow = async () => {
    if (!id) return;
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        body: JSON.stringify({ flowId: id, input: { text: "Run from details" } }),
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
    }
  };

  const deleteFlow = async () => {
    if (!id) return;
    const res = await fetch(`/api/automation/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/automations");
      return;
    }
    const json = await res.json().catch(() => ({}));
    setStatus(json.error || "Could not delete automation.");
  };

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!flow || flow.error) {
    return (
      <div className="space-y-4 max-md:space-y-6">
        <Alert variant="error">Automation not found.</Alert>
        <Link href="/dashboard/automations">
          <Button variant="secondary" className="max-md:w-full">
            Back to automations
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between max-md:flex-col max-md:items-start max-md:gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Automations</p>
            <h1 className="text-3xl font-semibold text-foreground">{flow.title}</h1>
            <p className="text-sm text-muted-foreground">{flow.description}</p>
          </div>
          <div className="flex gap-2 max-md:flex-col max-md:items-stretch max-md:w-full">
            <Badge variant="default" className="max-md:w-fit">
              {flow.status}
            </Badge>
            <Button variant="secondary" className="max-md:w-full" onClick={runFlow}>
              Run now
            </Button>
            <Button variant="ghost" className="max-md:w-full" onClick={deleteFlow}>
              Delete
            </Button>
          </div>
        </div>
        {status && <div className="mt-4"><Alert variant="info">{status}</Alert></div>}
      </div>
      <Card title="Details">
        <div className="grid gap-3 text-sm text-muted-foreground">
          <div>
            <span className="text-foreground">Category:</span> {flow.category || "-"}
          </div>
          <div>
            <span className="text-foreground">Created:</span> {new Date(flow.createdAt).toLocaleString()}
          </div>
        </div>
      </Card>
      <Card title="Steps">
        <pre className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-xs text-foreground">
          {JSON.stringify(flow.steps || [], null, 2)}
        </pre>
      </Card>
      <div>
        <Link href="/dashboard/automations">
          <Button variant="secondary" className="max-md:w-full">
            Back to automations
          </Button>
        </Link>
      </div>
    </div>
  );
}
