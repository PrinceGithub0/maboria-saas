"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Tabs } from "../ui/tabs";
import { Badge } from "../ui/badge";

type Trigger = { type: string; config: Record<string, any> };
type Action = { type: string; config: Record<string, any>; order: number };

export function WorkflowBuilder({
  onSave,
}: {
  onSave: (payload: { title: string; description: string; triggers: Trigger[]; actions: Action[] }) => Promise<void>;
}) {
  const [title, setTitle] = useState("New Workflow");
  const [description, setDescription] = useState("Describe your workflow");
  const [triggers, setTriggers] = useState<Trigger[]>([{ type: "webhook", config: { path: "/events" } }]);
  const [actions, setActions] = useState<Action[]>([
    { type: "sendEmail", config: { to: "user@example.com" }, order: 1 },
  ]);
  const [saving, setSaving] = useState(false);

  const addTrigger = () => setTriggers([...triggers, { type: "event", config: {} }]);
  const addAction = () =>
    setActions([...actions, { type: "apiCall", config: { url: "https://api" }, order: actions.length + 1 }]);

  const save = async () => {
    setSaving(true);
    await onSave({ title, description, triggers, actions });
    setSaving(false);
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
              <div className="space-y-4">
                <Card title="Triggers" actions={<Button onClick={addTrigger}>Add Trigger</Button>}>
                  <div className="space-y-2">
                    {triggers.map((t, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <Badge>{t.type}</Badge>
                          <span className="text-sm text-muted-foreground">#{idx + 1}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{JSON.stringify(t.config)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card title="Actions" actions={<Button variant="secondary" onClick={addAction}>Add Action</Button>}>
                  <div className="space-y-2">
                    {actions.map((a, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="success">{a.type}</Badge>
                          <span className="text-sm text-muted-foreground">Order {a.order}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{JSON.stringify(a.config)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ),
          },
          {
            id: "preview",
            label: "Preview JSON",
            content: (
              <pre className="rounded-2xl border border-border bg-muted/40 p-4 text-xs text-foreground">
                {JSON.stringify({ title, description, triggers, actions }, null, 2)}
              </pre>
            ),
          },
        ]}
      />
      <Button onClick={save} loading={saving}>
        Save workflow
      </Button>
    </div>
  );
}
