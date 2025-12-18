"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export default function SignupPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Signup failed");
      return;
    }
    setSuccess(true);
    // Redirect to login; no auto-login to avoid silent failures.
    router.push("/login?message=Account%20created");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-900 bg-slate-900/70 p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Maboria</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Create your account</h1>
        <p className="text-sm text-slate-400">Start automating invoices and payments.</p>
        {error && <Alert variant="error">{error}</Alert>}
        {success && <Alert variant="success">Account created. Redirecting to login...</Alert>}
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
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
          <Button className="w-full" loading={loading} type="submit">
            Create account
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <Link href="/login" className="text-indigo-300 hover:text-white">
            Sign in
          </Link>
          <Link href="/faq" className="text-indigo-300 hover:text-white">
            View FAQ
          </Link>
        </div>
      </div>
    </div>
  );
}
