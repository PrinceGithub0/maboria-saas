"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default function DashboardSupportPage() {
  const [form, setForm] = useState({ subject: "", message: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setStatus(null);
    if (sending) return;
    if (!form.subject.trim() || !form.message.trim()) {
      setStatus("Subject and message are required.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.subject, message: form.message }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setStatus("Please sign in to submit a support ticket.");
      } else if (!res.ok) {
        setStatus(data.error || `Could not submit ticket (status ${res.status}).`);
      } else {
        if (data.emailError) {
          setStatus(`Ticket submitted, but email could not be sent: ${data.emailError}`);
        } else {
          setStatus("Ticket submitted. We'll respond to your email.");
        }
        setForm({ subject: "", message: "" });
      }
    } catch (err: any) {
      setStatus(`Could not submit ticket. ${err?.message || "Please try again."}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Support</p>
        <h1 className="text-3xl font-semibold text-foreground">Contact support</h1>
        <p className="text-sm text-muted-foreground">Send a ticket directly from your dashboard.</p>
      </div>

      {status && <Alert variant="info">{status}</Alert>}

      <Card title="Submit a ticket">
        <div className="space-y-4">
          <Input
            label="Subject"
            placeholder="Billing, automation, AI..."
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          />
          <Textarea
            placeholder="Describe the issue"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          />
          <Button onClick={submit} loading={sending} className="w-full sm:w-auto">
            Submit ticket
          </Button>
        </div>
      </Card>
    </div>
  );
}
