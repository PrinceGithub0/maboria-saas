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
  const [errors, setErrors] = useState<{ subject?: string; message?: string }>({});

  const submit = async () => {
    setStatus(null);
    if (sending) return;
    const subject = form.subject.trim();
    const message = form.message.trim();
    const nextErrors: { subject?: string; message?: string } = {};
    if (subject.length < 5) nextErrors.subject = "Subject must be at least 5 characters.";
    if (message.length < 10) nextErrors.message = "Message must be at least 10 characters.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setStatus("Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: subject, message }),
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
        setErrors({});
      }
    } catch (err: any) {
      setStatus(`Could not submit ticket. ${err?.message || "Please try again."}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Support</p>
          <h1 className="text-3xl font-semibold text-foreground">Contact support</h1>
          <p className="text-sm text-muted-foreground">Send a ticket directly from your dashboard.</p>
        </div>

        {status && <div className="mt-4"><Alert variant="info">{status}</Alert></div>}
      </div>

      <Card title="Submit a ticket">
        <div className="space-y-4">
          <Input
            label="Subject"
            placeholder="Billing, automation, AI..."
            value={form.subject}
            onChange={(e) => {
              setForm((f) => ({ ...f, subject: e.target.value }));
              if (errors.subject) setErrors((prev) => ({ ...prev, subject: undefined }));
            }}
            minLength={5}
            required
            error={errors.subject}
          />
          <Textarea
            placeholder="Describe the issue"
            value={form.message}
            onChange={(e) => {
              setForm((f) => ({ ...f, message: e.target.value }));
              if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
            }}
            minLength={10}
            required
            error={errors.message}
          />
          <Button onClick={submit} loading={sending} className="w-full sm:w-auto">
            Submit ticket
          </Button>
        </div>
      </Card>
    </div>
  );
}
