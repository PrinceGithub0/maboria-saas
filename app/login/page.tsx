"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Lock, Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const params = useSearchParams();
  const resetSuccess = params.get("reset") === "success";
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
        otp: otp || undefined,
      });
      if (!res) {
        setError(t("Sign in failed. Please try again.", "Connexion echouee. Reessayez."));
        return;
      }
      if (res.error) {
        setError(
          res.error === "CredentialsSignin"
            ? t("Invalid email, password, or 2FA code.", "Email, mot de passe ou code 2FA invalide.")
            : res.error
        );
        return;
      }
      const sessionCheck = await fetch("/api/auth/session", { credentials: "include" });
      if (!sessionCheck.ok) {
        setError(
          t(
            "Sign in succeeded, but session cookie was not set. Check NEXTAUTH_URL and your browser URL.",
            "Connexion reussie, mais le cookie de session n'a pas ete defini. Verifiez NEXTAUTH_URL et l'URL du navigateur."
          )
        );
        return;
      }
      const session = await sessionCheck.json().catch(() => null);
      if (!session?.user) {
        setError(
          t(
            "Sign in succeeded, but session is empty. Check NEXTAUTH_URL and clear cookies.",
            "Connexion reussie, mais la session est vide. Verifiez NEXTAUTH_URL et supprimez les cookies."
          )
        );
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError(t("Sign in failed. Please try again.", "Connexion echouee. Reessayez."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-[420px] rounded-xl border border-border/70 bg-card p-8 shadow-[0_16px_36px_-22px_rgba(15,23,42,0.35)] sm:p-10">
        <div className="space-y-4">
          <div className="relative h-9 w-9 overflow-hidden rounded-xl border border-border bg-card">
            <Image src={logoSrc} alt="Maboria" fill sizes="36px" className="object-contain p-0 scale-110" priority />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">MABORIA</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("Welcome back", "Bon retour")}</h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Sign in to manage invoices, automation, and billing.",
                "Connectez-vous pour gerer factures, automatisation et facturation."
              )}
            </p>
          </div>
        </div>

        {resetSuccess && (
          <Alert className="mt-5" variant="success">
            {t(
              "Your password has been updated successfully. You can now sign in.",
              "Votre mot de passe a ete mis a jour avec succes. Vous pouvez maintenant vous connecter."
            )}
          </Alert>
        )}
        {params.get("message") && <Alert className="mt-5" variant="success">{params.get("message")}</Alert>}
        {error && <Alert className="mt-5" variant="error">{error}</Alert>}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-medium text-foreground">
            {t("Email", "Email")}
            <span className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/40"
                required
              />
            </span>
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            {t("Password", "Mot de passe")}
            <span className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("Enter your password", "Saisissez votre mot de passe")}
                autoComplete="current-password"
                className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-10 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/40"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            {t("2FA code (if enabled)", "Code 2FA (si active)")}
            <span className="relative">
              <Shield className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder={t("123456 or backup code", "123456 ou code de secours")}
                autoComplete="one-time-code"
                className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/40"
              />
            </span>
          </label>

          <Button
            className="h-11 w-full bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-md shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:from-indigo-500 hover:to-indigo-400"
            loading={loading}
            type="submit"
          >
            {t("Sign in", "Se connecter")}
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/create-account" className="transition hover:text-indigo-500 dark:hover:text-indigo-300">
            {t("Create account", "Creer un compte")}
          </Link>
          <Link href="/forgot-password" className="transition hover:text-indigo-500 dark:hover:text-indigo-300">
            {t("Forgot password?", "Mot de passe oublie ?")}
          </Link>
        </div>
        <div className="mt-3 text-center text-sm text-muted-foreground">
          <Link href="/faq" className="transition hover:text-indigo-500 dark:hover:text-indigo-300">
            {t("View FAQ", "Voir la FAQ")}
          </Link>
        </div>
      </div>
    </div>
  );
}
