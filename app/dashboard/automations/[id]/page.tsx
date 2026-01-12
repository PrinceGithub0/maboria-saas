"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const error = new Error(data?.error || "Failed to load automation");
    (error as any).status = res.status;
    (error as any).data = data;
    throw error;
  }
  return data;
};

const resolveStatusVariant = (message?: string | null) => {
  if (!message) return "info";
  const lowered = message.toLowerCase();
  if (
    lowered.includes("saved") ||
    lowered.includes("updated") ||
    lowered.includes("created") ||
    lowered.includes("started") ||
    lowered.includes("success")
  ) {
    return "success";
  }
  if (
    lowered.includes("missing") ||
    lowered.includes("upgrade") ||
    lowered.includes("limit") ||
    lowered.includes("could not") ||
    lowered.includes("invalid") ||
    lowered.includes("error") ||
    lowered.includes("denied")
  ) {
    return "error";
  }
  return "info";
};

export default function AutomationDetailsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const safeId =
    typeof id === "string" && id && id !== "undefined" && id !== "null" ? id : "";
  const { data: flow, error, isLoading } = useSWR(
    safeId ? `/api/automation/${encodeURIComponent(safeId)}` : null,
    fetcher
  );
  const [status, setStatus] = useState<string | null>(null);
  const [stepType, setStepType] = useState("parseText");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    category: "",
    status: "DRAFT",
    steps: [] as { type: string }[],
  });

  const stepOptions = [
    { value: "parseText", label: "Prepare input", adminOnly: true },
    { value: "extractData", label: "Extract key details", adminOnly: true },
    { value: "callApi", label: "Connect external service", adminOnly: true },
    { value: "generateInvoice", label: "Create invoice" },
    { value: "sendEmail", label: "Send email" },
    { value: "generateReport", label: "Generate report" },
    { value: "sendWhatsApp", label: "Send WhatsApp message", plan: "Pro" },
    { value: "aiTransform", label: "AI improve message", plan: "Pro" },
  ];
  const visibleStepOptions = stepOptions.filter((option) => isAdmin || !option.adminOnly);

  const getStepLabel = (type: string) => {
    const option = stepOptions.find((item) => item.value === type);
    if (option?.adminOnly && !isAdmin) return "Internal step";
    return option?.label || type;
  };

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

  const formatDateTime = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  const normalizeSteps = (value: any) => {
    if (!Array.isArray(value)) return [];
    return value
      .map((step) => {
        if (typeof step === "string") return { type: step };
        if (step && typeof step.type === "string") return { type: step.type };
        return null;
      })
      .filter(Boolean) as { type: string }[];
  };

  useEffect(() => {
    setInitialized(false);
  }, [id]);

  useEffect(() => {
    if (isAdmin) return;
    if (!visibleStepOptions.length) return;
    if (visibleStepOptions.some((option) => option.value === stepType)) return;
    setStepType(visibleStepOptions[0].value);
  }, [isAdmin, stepType, visibleStepOptions]);

  useEffect(() => {
    if (!flow || initialized) return;
    setEditForm({
      title: flow.title || "",
      description: flow.description || "",
      category: flow.category || "",
      status: flow.status || "DRAFT",
      steps: normalizeSteps(flow.steps),
    });
    setInitialized(true);
  }, [flow, initialized]);

  const runFlow = async () => {
    if (!safeId) {
      setStatus("Missing automation id.");
      return;
    }
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        body: JSON.stringify({ flowId: safeId, input: { text: "Run from details" } }),
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
    if (!safeId) {
      setStatus("Missing automation id.");
      return;
    }
    const res = await fetch(`/api/automation/${encodeURIComponent(safeId)}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/automations");
      return;
    }
    const json = await res.json().catch(() => ({}));
    setStatus(json.error || "Could not delete automation.");
  };

  const addStep = () => {
    setEditForm((prev) => ({ ...prev, steps: [...prev.steps, { type: stepType }] }));
  };

  const removeStep = (index: number) => {
    setEditForm((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, idx) => idx !== index),
    }));
  };

  const saveChanges = async () => {
    if (!safeId) {
      setStatus("Missing automation id.");
      return;
    }
    if (!editForm.steps.length) {
      setStatus("Add at least one step before saving.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/automation/${encodeURIComponent(safeId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.type === "upgrade_required") {
          setStatus(`${json.reason || "Upgrade required."} Required plan: ${formatPlan(json.requiredPlan)}.`);
        } else if (json.type === "limit_reached") {
          setStatus(`${json.reason || "Limit reached."} Required plan: ${formatPlan(json.requiredPlan)}.`);
        } else {
          setStatus(json.reason || json.error || "Could not update automation.");
        }
      } else {
        setStatus("Automation updated.");
      }
    } catch {
      setStatus("Could not update automation. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!safeId) {
    return (
      <div className="space-y-4 max-md:space-y-6">
        <Alert variant="error">Invalid automation link.</Alert>
        <Link href="/dashboard/automations">
          <Button variant="secondary" className="max-md:w-full">
            Back to automations
          </Button>
        </Link>
      </div>
    );
  }

  if (error) {
    const statusCode = (error as any).status;
    const errorData = (error as any).data || {};
    const message =
      statusCode === 404
        ? "Automation not found."
        : errorData.reason || errorData.error || "Unable to load automation.";
    return (
      <div className="space-y-4 max-md:space-y-6">
        <Alert variant="error">{message}</Alert>
        <Link href="/dashboard/automations">
          <Button variant="secondary" className="max-md:w-full">
            Back to automations
          </Button>
        </Link>
      </div>
    );
  }

  if (!flow) {
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

  const statusLabel = flow?.status ? String(flow.status) : "Draft";

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
              {statusLabel}
            </Badge>
            <Button variant="secondary" className="max-md:w-full" onClick={runFlow}>
              Run now
            </Button>
            <Button variant="ghost" className="max-md:w-full" onClick={deleteFlow}>
              Delete
            </Button>
          </div>
        </div>
        {status && (
          <div className="mt-4 flex">
            <Alert variant={resolveStatusVariant(status)} className="inline-flex w-fit max-w-[520px]">
              {status}
            </Alert>
          </div>
        )}
      </div>
      <Card title="Details">
        <div className="grid gap-3 text-sm text-muted-foreground">
          <div>
            <span className="text-foreground">Category:</span> {flow.category || "General"}
          </div>
          <div>
            <span className="text-foreground">Created:</span>{" "}
            {formatDateTime(flow.createdAt || flow.updatedAt)}
          </div>
        </div>
      </Card>
      <Card title="Steps">
        {normalizeSteps(flow.steps).length > 0 ? (
          <div className="space-y-2">
            {normalizeSteps(flow.steps).map((step, idx) => {
              const option = stepOptions.find((item) => item.value === step.type);
              return (
                <div
                  key={`${step.type}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 text-foreground">
                    <span className="font-medium">{getStepLabel(step.type)}</span>
                    {option?.plan && (
                      <Badge variant="warning" className="text-[11px]">
                        {option.plan}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No steps configured yet.</p>
        )}
      </Card>
      <Card title="Edit automation">
        <div className="space-y-4 text-sm">
          <label className="flex flex-col gap-2 text-sm text-foreground">
            Title
            <input
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            Category
            <input
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={editForm.category}
              onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            Description
            <textarea
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-foreground">
            Status
            <select
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-2 text-sm text-foreground">
                Step
                <select
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  value={stepType}
                  onChange={(e) => setStepType(e.target.value)}
                >
                  {visibleStepOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" variant="secondary" onClick={addStep}>
                Add step
              </Button>
            </div>
            {editForm.steps.length > 0 ? (
              <div className="space-y-2">
                {editForm.steps.map((step, idx) => {
                  const option = stepOptions.find((item) => item.value === step.type);
                  return (
                    <div
                      key={`${step.type}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2 text-foreground">
                        <span className="font-medium">{getStepLabel(step.type)}</span>
                        {option?.plan && (
                          <Badge variant="warning" className="text-[11px]">
                            {option.plan}
                          </Badge>
                        )}
                      </div>
                      {!option?.adminOnly || isAdmin ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeStep(idx)}>
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No steps configured yet.</p>
            )}
          </div>
          <Button type="button" loading={saving} onClick={saveChanges} className="max-md:w-full">
            Save changes
          </Button>
        </div>
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
