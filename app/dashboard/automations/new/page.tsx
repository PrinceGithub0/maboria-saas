"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";

export default function NewAutomationPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    steps: [] as { type: string }[],
  });
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stepType, setStepType] = useState("parseText");

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

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.steps.length) {
      setStatus("Add at least one step before saving.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, status: "ACTIVE" }),
    });
    let json: any = {};
    try {
      json = await res.json();
    } catch {
      json = {};
    }
    if (!res.ok) {
      if (json.type === "upgrade_required") {
        setStatus(`${json.reason || "Upgrade required."} Required plan: ${formatPlan(json.requiredPlan)}.`);
      } else if (json.type === "limit_reached") {
        setStatus(`${json.reason || "Limit reached."} Required plan: ${formatPlan(json.requiredPlan)}.`);
      } else {
        setStatus(json.reason || json.error || "Could not save automation.");
      }
    } else {
      const savedId = json?.id || json?.flow?.id;
      const safeId =
        typeof savedId === "string" && savedId && savedId !== "undefined" && savedId !== "null"
          ? savedId
          : "";
      if (!safeId) {
        setStatus("Saved, but could not resolve the automation id. Returning to list.");
        router.push("/dashboard/automations");
        return;
      }
      setStatus("Saved. Opening details...");
      router.push(`/dashboard/automations/${encodeURIComponent(safeId)}`);
    }
    setLoading(false);
  };

  const addStep = () => {
    setForm((prev) => ({ ...prev, steps: [...prev.steps, { type: stepType }] }));
  };

  const removeStep = (index: number) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, idx) => idx !== index),
    }));
  };

  return (
    <div className="space-y-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Automations</p>
          <h1 className="text-3xl font-semibold text-foreground">Create automation</h1>
        </div>
        {status && (
          <div className="mt-4 flex">
            <Alert
              variant={resolveStatusVariant(status)}
              className="inline-flex w-fit max-w-[520px]"
            >
              {status}
            </Alert>
          </div>
        )}
      </div>
      <Card>
        <form className="space-y-4" onSubmit={save}>
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Daily onboarding emails"
            autoFocus
          />
          <Input
            label="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Onboarding"
          />
          <label className="flex flex-col gap-2 text-sm text-foreground">
            Description
            <textarea
              className="rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Explain what this automation does..."
            />
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
            {form.steps.length > 0 ? (
              <div className="space-y-2">
                {form.steps.map((step, idx) => {
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
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeStep(idx)}>
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No steps added yet.</p>
            )}
          </div>
          <Button type="submit" loading={loading} className="max-md:w-full">
            Save automation
          </Button>
        </form>
      </Card>
    </div>
  );
}
