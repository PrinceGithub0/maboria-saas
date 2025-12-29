"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default function ResetPage() {
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (res.ok) {
      setStatus("Password updated. Redirecting to login...");
      setTimeout(() => router.push("/login"), 1200);
    } else {
      const data = await res.json();
      setStatus(data.error || "Reset failed");
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <Alert variant="error">Missing reset token</Alert>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl max-md:max-w-none">
        <h1 className="text-2xl font-semibold text-foreground">Reset password</h1>
        {status && <Alert variant="info">{status}</Alert>}
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <Input
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button className="w-full" loading={loading} type="submit">
            Update password
          </Button>
        </form>
      </div>
    </div>
  );
}
