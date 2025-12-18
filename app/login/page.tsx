"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
      otp: otp || undefined,
    });
    setLoading(false);
    if (res?.error) {
      setError(res.error === "CredentialsSignin" ? "Invalid email, password, or 2FA code." : res.error);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-900 bg-slate-900/70 p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">Maboria</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Welcome back</h1>
        <p className="text-sm text-slate-400">Sign in to manage automations and billing.</p>
        {params.get("message") && <Alert variant="success">{params.get("message")}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Input
            label="2FA code (if enabled)"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456 or backup code"
          />
          <Button className="w-full" loading={loading} type="submit">
            Sign in
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <Link href="/signup" className="text-indigo-300 hover:text-white">
            Create account
          </Link>
          <Link href="/forgot" className="text-indigo-300 hover:text-white">
            Forgot password
          </Link>
        </div>
        <div className="mt-4 text-center text-sm text-slate-400">
          <Link href="/faq" className="text-indigo-300 hover:text-white">
            View FAQ
          </Link>
        </div>
      </div>
    </div>
  );
}
