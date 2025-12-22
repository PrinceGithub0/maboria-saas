"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

export default function NewAutomationPage() {
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    steps: [],
  });
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, status: "ACTIVE" }),
    });
    const json = await res.json();
    if (!res.ok) {
      if (json.type === "upgrade_required") {
        setStatus(`${json.reason || "Upgrade required."} Required plan: ${formatPlan(json.requiredPlan)}.`);
      } else if (json.type === "limit_reached") {
        setStatus(`${json.reason || "Limit reached."} Required plan: ${formatPlan(json.requiredPlan)}.`);
      } else {
        setStatus(json.reason || json.error || "Could not save automation.");
      }
    } else {
      setStatus("Saved");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Automations</p>
        <h1 className="text-3xl font-semibold text-foreground">Create automation</h1>
      </div>
      {status && <Alert variant="info">{status}</Alert>}
      <Card>
        <form className="space-y-3" onSubmit={save}>
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
          <Button type="submit" loading={loading}>
            Save automation
          </Button>
        </form>
      </Card>
    </div>
  );
}
