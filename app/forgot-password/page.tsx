"use client";

import Image from "next/image";
import Link from "next/link";
import { Mail } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";

const NEUTRAL_MESSAGE_EN = "If an account exists for this email, a reset link has been sent.";
const NEUTRAL_MESSAGE_FR =
  "Si un compte existe pour cet email, un lien de reinitialisation a ete envoye.";

export default function ForgotPasswordPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const logoSrc = "/branding/Maboria%20Company%20logo.png";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Keep response neutral in every outcome to avoid account enumeration.
    } finally {
      setStatus(t(NEUTRAL_MESSAGE_EN, NEUTRAL_MESSAGE_FR));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-[420px] rounded-xl border border-border/70 bg-card p-8 shadow-[0_16px_36px_-22px_rgba(15,23,42,0.35)] sm:p-10">
        <div className="space-y-4">
          <div className="relative h-9 w-9 overflow-hidden rounded-xl border border-border bg-card">
            <Image src={logoSrc} alt="Maboria" fill sizes="36px" className="object-contain p-0 scale-110" priority />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">MABORIA</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {t("Reset your password", "Reinitialiser votre mot de passe")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Enter your account email and we'll send you a secure reset link.",
                "Entrez votre email de compte et nous vous enverrons un lien securise."
              )}
            </p>
          </div>
        </div>

        {status ? (
          <Alert className="mt-6" variant="success">
            {status}
          </Alert>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              {t("Email", "Email")}
              <span className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/40"
                  required
                />
              </span>
            </label>

            <Button
              className="h-11 w-full bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-md shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:from-indigo-500 hover:to-indigo-400"
              loading={loading}
              type="submit"
            >
              {t("Send reset link", "Envoyer le lien")}
            </Button>
          </form>
        )}

        <div className="mt-5 text-sm text-muted-foreground">
          <Link href="/login" className="transition hover:text-indigo-500 dark:hover:text-indigo-300">
            {t("Back to sign in", "Retour a la connexion")}
          </Link>
        </div>
      </div>
    </div>
  );
}
