"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (res.ok) {
      setStatus("If the email exists, a reset link has been sent.");
    } else {
      const data = await res.json();
      setStatus(data.error || "Request failed");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold text-foreground">Forgot password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we will send a secure reset link.
        </p>
        {status && <Alert variant="info">{status}</Alert>}
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button className="w-full" loading={loading} type="submit">
            Send reset link
          </Button>
        </form>
      </div>
    </div>
  );
}
