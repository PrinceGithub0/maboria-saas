 "use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

const faqs = [
  { q: "How do I create automations?", a: "Use the dashboard Automations tab or AI flow generator." },
  { q: "How does billing work?", a: "Choose USD (Stripe) or NGN (Paystack); subscriptions renew monthly." },
  { q: "Where can I see logs?", a: "Admins can view system logs in the Admin panel; users see run logs in dashboard." },
];

export default function SupportPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ email: "", subject: "", message: "" });

  const submit = async () => {
    setStatus(null);
    if (!form.subject.trim() || !form.message.trim()) {
      setStatus("Subject and message are required.");
      return;
    }
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.subject, message: `${form.message}\n\nFrom: ${form.email || "N/A"}` }),
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
        setForm({ email: "", subject: "", message: "" });
      }
    } catch {
      setStatus("Could not submit ticket. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-12 text-foreground">
      <h1 className="text-3xl font-semibold">Support Center</h1>
      <div className="grid gap-6 md:grid-cols-3">
        <Card title="FAQ">
          <div className="space-y-3 text-sm text-muted-foreground">
            {faqs.map((item) => (
              <div key={item.q}>
                <p className="font-semibold text-foreground">{item.q}</p>
                <p className="text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Troubleshooting">
          <p className="text-sm text-muted-foreground">
            Restart failed automations from Runs, verify webhook signatures, ensure billing details are valid, and
            check system status on /status.
          </p>
        </Card>
        <Card title="Documentation">
          <p className="text-sm text-muted-foreground">See internal /docs for architecture, APIs, and deployment guides.</p>
        </Card>
      </div>
      <Card title="Contact support">
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Email us directly at{" "}
            <a className="text-indigo-500 hover:text-indigo-400" href="mailto:info@maboria.com">
              info@maboria.com
            </a>{" "}
            for urgent issues. You can also submit the form below.
          </p>
        </div>
        {status && <p className="mt-3 text-sm text-foreground">{status}</p>}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Input
            label="Email"
            placeholder="you@company.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            label="Subject"
            placeholder="Billing, automation, AI..."
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          />
          <div className="md:col-span-2">
            <Textarea
              placeholder="Describe the issue"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <Button onClick={submit} loading={sending}>
              Submit ticket
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
