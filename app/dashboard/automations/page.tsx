"use client";

import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
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
  const { data: runs, mutate: mutateRuns } = useSWR("/api/automation/runs", fetcher, {
    refreshInterval: 4000,
    revalidateOnFocus: true,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");

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

  const resolveStatusVariant = (message?: string | null) => {
    if (!message) return "info";
    const lowered = message.toLowerCase();
    if (
      lowered.includes("could not") ||
      lowered.includes("missing") ||
      lowered.includes("upgrade") ||
      lowered.includes("limit") ||
      lowered.includes("error") ||
      lowered.includes("denied")
    ) {
      return "error";
    }
    if (lowered.includes("saved") || lowered.includes("started") || lowered.includes("updated")) {
      return "success";
    }
    return "info";
  };

  const runFlow = async (id: string) => {
    if (!id || id === "undefined" || id === "null") {
      setStatus("Missing automation id.");
      return;
    }
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
    mutateRuns();
    setTimeout(() => {
      mutateRuns();
    }, 1500);
  };

  const flowList = Array.isArray(flows) ? flows : [];
  const runList = Array.isArray(runs) ? runs : [];
  const getSafeId = (value: any) =>
    typeof value === "string" && value && value !== "undefined" && value !== "null" ? value : "";
  const normalizedQuery = query.trim().toLowerCase();
  const statusBuckets = flowList.reduce(
    (acc: Record<string, number>, flow: any) => {
      const key = String(flow?.status || "unknown").toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {}
  );
  const totalFlows = flowList.length;
  const activeFlows = statusBuckets.active || 0;
  const pausedFlows = statusBuckets.paused || 0;
  const failedFlows = statusBuckets.failed || 0;
  const draftFlows = statusBuckets.draft || 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentRuns = runList.filter((run: any) => {
    const createdAt = run?.createdAt ? new Date(run.createdAt).getTime() : 0;
    return createdAt >= weekAgo;
  });
  const runSuccess = recentRuns.filter((run: any) => run?.status === "SUCCESS").length;
  const runFailed = recentRuns.filter((run: any) => run?.status === "FAILED").length;
  const runTotal = recentRuns.filter((run: any) =>
    ["SUCCESS", "FAILED", "RUNNING", "PENDING"].includes(String(run?.status || ""))
  ).length;
  const healthScore = runTotal
    ? Math.max(0, Math.min(100, Math.round((runSuccess / runTotal) * 100)))
    : totalFlows
    ? Math.max(0, Math.min(100, Math.round(((activeFlows - failedFlows * 0.5) / totalFlows) * 100)))
    : 0;

  const hasAiStep = (flow: any) => {
    if (flow?.aiParams && Object.keys(flow.aiParams || {}).length > 0) return true;
    const steps = Array.isArray(flow?.steps) ? flow.steps : [];
    return steps.some((step: any) => {
      if (typeof step === "string") return step.toLowerCase().includes("ai");
      const typeValue = typeof step?.type === "string" ? step.type : "";
      return typeValue.toLowerCase().includes("ai");
    });
  };

  const filteredFlows = flowList
    .filter((flow: any) => {
      if (statusFilter === "all") return true;
      return String(flow?.status || "").toLowerCase() === statusFilter;
    })
    .filter((flow: any) => {
      if (!normalizedQuery) return true;
      const title = String(flow?.title || "").toLowerCase();
      const description = String(flow?.description || "").toLowerCase();
      const category = String(flow?.category || "").toLowerCase();
      return (
        title.includes(normalizedQuery) ||
        description.includes(normalizedQuery) ||
        category.includes(normalizedQuery)
      );
    });

  const sortedFlows = [...filteredFlows].sort((a: any, b: any) => {
    if (sortBy === "name") {
      return String(a?.title || "").localeCompare(String(b?.title || ""));
    }
    if (sortBy === "status") {
      return String(a?.status || "").localeCompare(String(b?.status || ""));
    }
    const aTime = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });
  const primaryFlow = sortedFlows[0] || null;
  const remainingFlows = primaryFlow ? sortedFlows.slice(1) : [];

  const statusOptions = [
    { label: "All", value: "all" },
    { label: "Active", value: "active" },
    { label: "Draft", value: "draft" },
    { label: "Paused", value: "paused" },
    { label: "Failed", value: "failed" },
  ];

  const formatDate = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toISOString().slice(0, 10);
  };

  const resolveHealthTone = (value: number) => {
    if (value >= 80) {
      return {
        pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
        bar: "bg-emerald-500",
      };
    }
    if (value >= 50) {
      return {
        pill: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
        bar: "bg-amber-500",
      };
    }
    return {
      pill: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
      bar: "bg-rose-500",
    };
  };

  const healthTone = resolveHealthTone(healthScore);

  const resolveStatusBadge = (value?: string) => {
    switch (String(value || "").toLowerCase()) {
      case "active":
        return "success";
      case "paused":
        return "warning";
      case "failed":
        return "danger";
      case "draft":
        return "default";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-6 max-md:space-y-7">
      <section className="space-y-4 border-b border-border/60 pb-6">
        <div className="flex items-start justify-between gap-4 max-md:flex-col">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-indigo-600 dark:text-indigo-300">
              Automations
            </p>
            <h1 className="text-3xl font-semibold text-foreground">Automation command center</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Monitor every flow, keep execution healthy, and launch runs with confidence.
            </p>
          </div>
          <Button className="max-md:w-full" onClick={() => router.push("/dashboard/automations/new")}>
            Create automation
          </Button>
        </div>
        {status && (
          <div className="flex">
            <Alert
              variant={resolveStatusVariant(status)}
              className="inline-flex w-fit max-w-[520px]"
            >
              {status}
            </Alert>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-5 max-md:grid-cols-2">
          {[
            { label: "Total flows", value: totalFlows },
            { label: "Active", value: activeFlows },
            { label: "Draft", value: draftFlows },
            { label: "Paused", value: pausedFlows },
            { label: "AI assisted", value: flowList.filter((flow: any) => hasAiStep(flow)).length },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-muted/40 px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-3xl border border-border/60 bg-background/80 px-5 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-2xl px-3 py-2 text-sm font-semibold ${healthTone.pill}`}>
                {healthScore}% healthy
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Automation health</p>
                <p className="text-sm text-muted-foreground">Last 7 days overview</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border/60 bg-background px-3 py-1">
                Failed: {runTotal ? runFailed : failedFlows}
              </span>
              <span className="rounded-full border border-border/60 bg-background px-3 py-1">
                Updated: {formatDate(new Date().toISOString())}
              </span>
            </div>
          </div>
          <div className="mt-4 h-3 w-full rounded-full bg-border/30">
            <div className={`h-3 rounded-full ${healthTone.bar}`} style={{ width: `${healthScore}%` }} />
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[220px] flex-1">
          <Input
            label="Search"
            placeholder="Search by name, category, or description"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sort</label>
          <select
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
          >
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={statusFilter === option.value ? "primary" : "secondary"}
              onClick={() => setStatusFilter(option.value)}
              type="button"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        {flowsError && (
          <Alert variant="error">
            {(flowsError as any)?.data?.reason ||
              (flowsError as any)?.data?.error ||
              "Unable to load automations."}
          </Alert>
        )}

        {sortedFlows.length > 0 && (
          <div className="space-y-4">
            {primaryFlow && (
              <div className="rounded-3xl border border-border/70 bg-background/80 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Featured flow</p>
                    <h2 className="mt-1 text-2xl font-semibold text-foreground">{primaryFlow.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                      {primaryFlow.description || "No description provided."}
                    </p>
                  </div>
                  <Badge variant={resolveStatusBadge(primaryFlow.status)}>{primaryFlow.status}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-3 py-1">
                    Category: {primaryFlow.category || "General"}
                  </span>
                  <span className="rounded-full border border-border px-3 py-1">
                    Steps: {Array.isArray(primaryFlow.steps) ? primaryFlow.steps.length : 0}
                  </span>
                  <span className="rounded-full border border-border px-3 py-1">
                    Updated: {formatDate(primaryFlow.updatedAt)}
                  </span>
                  {hasAiStep(primaryFlow) && (
                    <span className="rounded-full border border-border px-3 py-1 text-indigo-600 dark:text-indigo-300">
                      AI assisted
                    </span>
                  )}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {(() => {
                    const safeId = getSafeId(primaryFlow.id);
                    return (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (!safeId) {
                            setStatus("Missing automation id.");
                            return;
                          }
                          router.push(`/dashboard/automations/${encodeURIComponent(safeId)}`);
                        }}
                        type="button"
                      >
                        Open details
                      </Button>
                    );
                  })()}
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => runFlow(primaryFlow.id)}
                    loading={runningId === primaryFlow.id}
                    disabled={runningId === primaryFlow.id}
                    type="button"
                  >
                    Run now
                  </Button>
                </div>
              </div>
            )}

            {remainingFlows.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {remainingFlows.map((flow: any) => (
                  <div
                    key={flow.id}
                    className="group rounded-2xl border border-border/60 bg-background/70 p-5 transition hover:border-indigo-500/40 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          {flow.category || "General"}
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-foreground">{flow.title}</h3>
                      </div>
                      <Badge variant={resolveStatusBadge(flow.status)}>{flow.status}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {flow.description || "No description provided."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-border px-2.5 py-1">
                        Steps: {Array.isArray(flow.steps) ? flow.steps.length : 0}
                      </span>
                      <span className="rounded-full border border-border px-2.5 py-1">
                        Updated: {formatDate(flow.updatedAt)}
                      </span>
                      {hasAiStep(flow) && (
                        <span className="rounded-full border border-border px-2.5 py-1 text-indigo-600 dark:text-indigo-300">
                          AI assisted
                        </span>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(() => {
                        const safeId = getSafeId(flow.id);
                        return (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              if (!safeId) {
                                setStatus("Missing automation id.");
                                return;
                              }
                              router.push(`/dashboard/automations/${encodeURIComponent(safeId)}`);
                            }}
                            type="button"
                          >
                            Open details
                          </Button>
                        );
                      })()}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => runFlow(flow.id)}
                        loading={runningId === flow.id}
                        disabled={runningId === flow.id}
                        type="button"
                      >
                        Run
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {sortedFlows.length === 0 && !isLoading && (
          <EmptyState
            title="No automations yet"
            description="Create your first automation flow to start orchestrating tasks."
            actionLabel="Create automation"
            onAction={() => router.push("/dashboard/automations/new")}
          />
        )}
      </section>
    </div>
  );
}
