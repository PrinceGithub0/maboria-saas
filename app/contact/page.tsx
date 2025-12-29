"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { useState } from "react";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setError(null);
    setLoading(true);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not send message.");
      return;
    }
    if (data.error) {
      setError(data.error);
      return;
    }
    setStatus("Message sent. We will respond shortly.");
    setForm({ name: "", email: "", company: "", message: "" });
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16 space-y-6 max-md:mx-0 max-md:w-full max-md:max-w-none">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Talk to us</p>
          <h1 className="text-4xl font-semibold text-foreground">Contact Maboria</h1>
          <p className="text-muted-foreground">
            We respond within one business day. You can also email us at{" "}
            <a className="text-indigo-500 hover:text-indigo-400" href="mailto:info@maboria.com">
              info@maboria.com
            </a>
            .
          </p>
        </div>
        <Card>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {status && <Alert variant="success">{status}</Alert>}
            {error && <Alert variant="error">{error}</Alert>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Name"
                placeholder="Your name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Input
                label="Email"
                placeholder="you@company.com"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <Input
              label="Company"
              placeholder="Company"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
            <Textarea
              label="Message"
              placeholder="Tell us about your needs..."
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              required
              rows={6}
            />
            <Button loading={loading} type="submit">
              Send message
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
