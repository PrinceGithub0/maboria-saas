"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";

export default function SignupPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    planIntent: "trial",
    autoRenew: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [intent, setIntent] = useState<"trial" | "starter" | "pro">("trial");
  const [loading, setLoading] = useState(false);
  const logoSrc = "/branding/Maboria%20Company%20logo.png";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.autoRenew) {
      setError("You must accept auto-renew to continue.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const email = form.email.toLowerCase().trim();
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Signup failed");
        return;
      }
      setUserId(data.userId || null);
      if (data?.planIntent) setIntent(data.planIntent);
      setSuccess(true);

      const result = await signIn("credentials", {
        redirect: false,
        email,
        password: form.password,
        callbackUrl: "/dashboard",
      });
      if (result?.error) {
        setError("Account created, but sign-in failed. Please sign in to continue.");
        return;
      }
      if (typeof window !== "undefined") {
        window.location.href = result?.url || "/dashboard";
      }
    } catch {
      setError("Signup succeeded, but automatic sign-in failed. Please sign in to continue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-muted/40 to-background px-4 py-12 text-foreground">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-10 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="relative mx-auto w-full max-w-xl rounded-3xl border border-border/70 bg-card/80 p-6 shadow-2xl backdrop-blur sm:p-8 max-md:mx-0 max-md:max-w-none">
        <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-border bg-card">
                <Image src={logoSrc} alt="Maboria" fill className="object-contain p-0 scale-110" priority />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-300">Maboria</p>
                <p className="text-lg font-semibold text-foreground">Create your account</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Start automating invoices, subscriptions, and customer updates in minutes.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="success"
                className="text-[10px] uppercase tracking-[0.2em]"
                style={{
                  backgroundColor: "#d1fae5",
                  color: "#0f172a",
                  borderColor: "#6ee7b7",
                }}
              >
                Trusted billing
              </Badge>
              <Badge
                variant="default"
                className="text-[10px] uppercase tracking-[0.2em] !bg-slate-900 !text-white !border-slate-900 dark:!bg-slate-800 dark:!text-slate-100 dark:!border-slate-700"
              >
                AI automation
              </Badge>
              <Badge
                variant="default"
                className="text-[10px] uppercase tracking-[0.2em] !bg-slate-900 !text-white !border-slate-900 dark:!bg-slate-800 dark:!text-slate-100 dark:!border-slate-700"
              >
                Team-ready
              </Badge>
            </div>
            {error && <Alert variant="error">{error}</Alert>}
            {success && (
              <Alert variant="success">
                {intent === "trial"
                  ? "Trial started. Please sign in to continue."
                  : "Account created. Please sign in to complete subscription."}
                {userId ? ` Your user ID: ${userId}.` : ""}
              </Alert>
            )}
            {success && userId && (
              <p className="text-xs text-muted-foreground">
                User ID: <span className="font-mono text-foreground">{userId}</span>
              </p>
            )}
            {success && (
              <div className="rounded-2xl border border-border bg-card/60 p-4">
                <p className="text-sm font-semibold text-foreground">Continue to billing</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  If you are not redirected automatically, continue to payment setup to add your card.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/dashboard/payments">
                    <Button size="sm">Go to payment setup</Button>
                  </Link>
                  <Link href="/login">
                    <Button size="sm" variant="secondary">
                      Sign in again
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Choose how to start</p>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
                <input
                  type="radio"
                  name="planIntent"
                  value="trial"
                  checked={form.planIntent === "trial"}
                  onChange={() => setForm({ ...form, planIntent: "trial" })}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Start 7-day free trial</p>
                  <p className="text-xs text-muted-foreground">Auto-renews to a paid plan unless canceled.</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
                <input
                  type="radio"
                  name="planIntent"
                  value="starter"
                  checked={form.planIntent === "starter"}
                  onChange={() => setForm({ ...form, planIntent: "starter" })}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Subscribe to Starter</p>
                  <p className="text-xs text-muted-foreground">Best for founders getting started.</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
                <input
                  type="radio"
                  name="planIntent"
                  value="pro"
                  checked={form.planIntent === "pro"}
                  onChange={() => setForm({ ...form, planIntent: "pro" })}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Subscribe to Pro</p>
                  <p className="text-xs text-muted-foreground">Unlock AI workflows and WhatsApp automation.</p>
                </div>
              </label>
            </div>
          </div>
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
              checked={form.autoRenew}
              onChange={(e) => setForm({ ...form, autoRenew: e.target.checked })}
              required
            />
            <span>
              {form.planIntent === "trial"
                ? "I understand my trial will auto-renew unless I cancel before the renewal date."
                : "I understand my subscription will auto-renew unless I cancel before the renewal date."}
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            Two-factor authentication (2FA) can be enabled after sign-in from Settings.
          </p>
          <Button className="w-full" loading={loading} type="submit">
            Create account
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/login" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200">
            Sign in
          </Link>
          <Link href="/faq" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200">
            View FAQ
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
}
