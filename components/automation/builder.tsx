"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tabs } from "../ui/tabs";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";

type Step = { type: string; config: Record<string, any> };

export function AutomationBuilder({
  onSave,
}: {
  onSave: (payload: { title: string; description: string; steps: Step[] }) => Promise<void>;
}) {
  const [title, setTitle] = useState("New Automation");
  const [description, setDescription] = useState("Generated with builder");
  const [steps, setSteps] = useState<Step[]>([]);
  const [newStepType, setNewStepType] = useState("parseText");
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const addStep = () => setSteps([...steps, { type: newStepType, config: {} }]);
  const removeStep = (index: number) => setSteps(steps.filter((_, i) => i !== index));

  const save = async () => {
    setSaving(true);
    await onSave({ title, description, steps });
    setSaving(false);
  };

  const generateWithAI = async () => {
    if (!aiPrompt) return;
    setAiLoading(true);
    const res = await fetch("/api/ai/assistant", {
      method: "POST",
      body: JSON.stringify({ mode: "automation", prompt: aiPrompt }),
    });
    const data = await res.json();
    try {
      const json = JSON.parse(data.flow || "{}");
      setTitle(json.title || title);
      setDescription(json.description || description);
      setSteps(json.steps || []);
    } catch {
      // ignore parse errors
    }
    setAiLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <Tabs
        tabs={[
          {
            id: "design",
            label: "Design",
            content: (
              <Card title="Steps" actions={<AddStep onAdd={addStep} onSelect={setNewStepType} />}>
                <div className="space-y-3">
                  {steps.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl border border-border bg-muted/50 px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="default">{step.type}</Badge>
                        <span className="text-sm text-foreground">Step {idx + 1}</span>
                      </div>
                      <Button variant="ghost" onClick={() => removeStep(idx)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                  {steps.length === 0 && (
                    <p className="text-sm text-muted-foreground">No steps yet. Add your first step.</p>
                  )}
                </div>
              </Card>
            ),
          },
          {
            id: "preview",
            label: "Preview JSON",
            content: (
              <pre className="rounded-2xl border border-border bg-muted/40 p-4 text-xs text-foreground">
                {JSON.stringify({ title, description, steps }, null, 2)}
              </pre>
            ),
          },
        ]}
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Button onClick={save} loading={saving}>
          Save Automation
        </Button>
        <input
          placeholder="Describe a flow and let AI build it"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <Button variant="secondary" onClick={generateWithAI} loading={aiLoading}>
          AI Generate
        </Button>
      </div>
    </div>
  );
}

function AddStep({
  onAdd,
  onSelect,
}: {
  onAdd: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <select
        onChange={(e) => onSelect(e.target.value)}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
      >
        <option value="parseText">Parse text</option>
        <option value="extractData">Extract data</option>
        <option value="callApi">Call external API</option>
        <option value="generateInvoice">Create invoice</option>
        <option value="sendEmail">Send email</option>
        <option value="generateReport">Generate report</option>
        <option value="aiTransform">AI summarization</option>
      </select>
      <Button variant="secondary" onClick={onAdd}>
        Add Step
      </Button>
    </div>
  );
}
