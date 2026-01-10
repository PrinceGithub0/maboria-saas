"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Tabs } from "../ui/tabs";
import { Badge } from "../ui/badge";

type Trigger = { type: string; config: Record<string, any> };
type Action = { type: string; config: Record<string, any>; order: number };

const TRIGGER_TYPES = [
  { value: "invoice_status", label: "Invoice status", helper: "Recommended" },
  { value: "webhook", label: "Webhook", helper: "Advanced" },
  { value: "event", label: "Event", helper: "Advanced" },
];

const INVOICE_STATUSES = [
  { value: "UNPAID", label: "UNPAID" },
  { value: "SENT", label: "SENT" },
  { value: "OVERDUE", label: "OVERDUE" },
  { value: "PAID", label: "PAID" },
];

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

  const addTrigger = () =>
    setTriggers([...triggers, { type: "invoice_status", config: { status: "UNPAID" } }]);
  const addAction = () =>
    setActions([...actions, { type: "apiCall", config: { url: "https://api" }, order: actions.length + 1 }]);

  const updateTrigger = (index: number, next: Trigger) => {
    setTriggers(triggers.map((t, idx) => (idx === index ? next : t)));
  };

  const updateTriggerType = (index: number, type: string) => {
    if (type === "invoice_status") {
      updateTrigger(index, { type, config: { status: "UNPAID" } });
      return;
    }
    if (type === "webhook") {
      updateTrigger(index, { type, config: { path: "/events" } });
      return;
    }
    updateTrigger(index, { type, config: { event: "custom_event" } });
  };

  const updateTriggerConfig = (index: number, config: Record<string, any>) => {
    updateTrigger(index, { ...triggers[index], config });
  };

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
                        className="space-y-3 rounded-xl border border-border bg-muted/40 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>Trigger {idx + 1}</Badge>
                          {t.type === "invoice_status" && <Badge variant="success">Recommended</Badge>}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-xs text-muted-foreground">
                            Trigger type
                            <select
                              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                              value={t.type}
                              onChange={(event) => updateTriggerType(idx, event.target.value)}
                            >
                              {TRIGGER_TYPES.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label} {option.helper ? `(${option.helper})` : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          {t.type === "invoice_status" && (
                            <label className="text-xs text-muted-foreground">
                              Run when invoice status becomes
                              <select
                                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                                value={t.config?.status || "UNPAID"}
                                onChange={(event) =>
                                  updateTriggerConfig(idx, { ...t.config, status: event.target.value })
                                }
                              >
                                {INVOICE_STATUSES.map((status) => (
                                  <option key={status.value} value={status.value}>
                                    {status.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {t.type === "webhook" && (
                            <label className="text-xs text-muted-foreground">
                              Webhook path
                              <input
                                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                                value={t.config?.path || ""}
                                onChange={(event) =>
                                  updateTriggerConfig(idx, { ...t.config, path: event.target.value })
                                }
                                placeholder="/events"
                              />
                            </label>
                          )}
                          {t.type === "event" && (
                            <label className="text-xs text-muted-foreground">
                              Event name (internal)
                              <input
                                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                                value={t.config?.event || ""}
                                onChange={(event) =>
                                  updateTriggerConfig(idx, { ...t.config, event: event.target.value })
                                }
                                placeholder="custom_event"
                              />
                            </label>
                          )}
                        </div>
                        {t.type === "invoice_status" && (
                          <p className="text-xs text-muted-foreground">
                            This runs automatically when an invoice status changes (UNPAID, SENT, OVERDUE, PAID).
                          </p>
                        )}
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
