"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import Image from "next/image";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const logoSrc = "/branding/Maboria%20Company%20logo.png";

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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl max-md:max-w-none">
        <div className="flex items-center gap-2">
          <div className="relative h-9 w-9 overflow-hidden rounded-xl border border-border bg-card">
            <Image src={logoSrc} alt="Maboria" fill className="object-contain p-0 scale-110" priority />
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Maboria</p>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to manage automations and billing.</p>
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
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/signup" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200">
            Create account
          </Link>
          <Link href="/forgot" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200">
            Forgot password
          </Link>
        </div>
        <div className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/faq" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200">
            View FAQ
          </Link>
        </div>
      </div>
    </div>
  );
}
