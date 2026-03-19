"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { Lock, Mail, User, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";
import { useSearchParams } from "next/navigation";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_MIN_LENGTH_ERROR,
  PASSWORD_MIN_LENGTH_HELPER_TEXT,
} from "@/lib/password-policy";

export default function SignupPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    planIntent: "starter",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [redirectTarget, setRedirectTarget] = useState<string>("/checkout");
  const [joinedWorkspace, setJoinedWorkspace] = useState(false);
  const [loading, setLoading] = useState(false);
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") || undefined;
  const inviteEmail = searchParams.get("email") || "";

  useEffect(() => {
    if (inviteEmail && !form.email) {
      setForm((prev) => ({ ...prev, email: inviteEmail }));
    }
  }, [inviteEmail, form.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setError(PASSWORD_MIN_LENGTH_ERROR);
      return;
    }
    setLoading(true);
    try {
      const email = form.email.toLowerCase().trim();
      const locale = typeof navigator !== "undefined" && navigator.language ? navigator.language : undefined;
      const timeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
      const nextRedirectTarget =
        inviteToken ? "/dashboard" : "/checkout";
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email, inviteToken, locale, timeZone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t("Signup failed", "Echec de l inscription"));
        return;
      }
      setUserId(data.userId || null);
      setRedirectTarget(typeof data.redirectTo === "string" && data.redirectTo ? data.redirectTo : nextRedirectTarget);
      setJoinedWorkspace(Boolean(data.joinedWorkspace));
      setSuccess(true);
      const callbackUrl =
        typeof data.redirectTo === "string" && data.redirectTo ? data.redirectTo : nextRedirectTarget;

      const result = await signIn("credentials", {
        redirect: false,
        email,
        password: form.password,
        callbackUrl,
      });
      if (result?.error) {
        setError(
          t(
            "Account created, but sign-in failed. Please sign in to continue.",
            "Compte cree, mais connexion echouee. Veuillez vous connecter."
          )
        );
        return;
      }
      if (typeof window !== "undefined") {
        window.location.href = result?.url || callbackUrl;
      }
    } catch {
      setError(
        t(
          "Signup succeeded, but automatic sign-in failed. Please sign in to continue.",
          "Inscription reussie, mais connexion automatique echouee. Veuillez vous connecter."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const selectedPlanClass = "border-indigo-500 bg-indigo-500/5 ring-2 ring-indigo-500/20";
  const planClass = "border-border bg-background/70 hover:border-indigo-300/70";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-[560px] rounded-2xl border border-border/70 bg-card p-8 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)] sm:p-10">
        <div className="space-y-4">
          <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-border bg-card">
            <Image src={logoSrc} alt="Maboria" fill sizes="40px" className="object-contain p-0 scale-110" priority />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">MABORIA</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {t("Create your account", "Creez votre compte")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Set up your workspace and start automating collections with clarity.",
                "Configurez votre espace et automatisez vos encaissements avec clarte."
              )}
            </p>
          </div>
        </div>

        {error && <Alert className="mt-5" variant="error">{error}</Alert>}
        {success && (
          <Alert className="mt-5" variant="success">
            {t(
              joinedWorkspace
                ? "Account created. Redirecting you to your workspace."
                : "Account created. Redirecting you to checkout.",
              joinedWorkspace
                ? "Compte cree. Redirection vers votre espace de travail."
                : "Compte cree. Redirection vers le paiement."
            )}
            {userId ? ` Your user ID: ${userId}.` : ""}
          </Alert>
        )}
        {success && userId && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("User ID:", "ID utilisateur:")} <span className="font-mono text-foreground">{userId}</span>
          </p>
        )}
        {success && (
          <div className="mt-4 rounded-xl border border-border bg-background/70 p-4">
            <p className="text-sm font-semibold text-foreground">
              {t(
                joinedWorkspace ? "Continue to workspace" : "Continue to checkout",
                joinedWorkspace ? "Continuer vers l espace" : "Continuer vers le paiement"
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                joinedWorkspace
                  ? "If you are not redirected automatically, continue to your workspace."
                  : "If you are not redirected automatically, continue to payment to activate your subscription.",
                joinedWorkspace
                  ? "Si vous n etes pas redirige, poursuivez vers votre espace de travail."
                  : "Si vous n etes pas redirige, poursuivez le paiement pour activer votre abonnement."
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={redirectTarget}>
                <Button size="sm">
                  {t(
                    joinedWorkspace ? "Go to workspace" : "Go to checkout",
                    joinedWorkspace ? "Aller a l espace" : "Aller au paiement"
                  )}
                </Button>
              </Link>
              <Link href="/login">
                <Button size="sm" variant="secondary">
                  {t("Sign in again", "Se connecter a nouveau")}
                </Button>
              </Link>
            </div>
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          {!inviteToken ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">{t("Choose how to start", "Choisissez comment demarrer")}</p>
              <div className="grid gap-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${form.planIntent === "starter" ? selectedPlanClass : planClass}`}
                >
                  <input
                    type="radio"
                    name="planIntent"
                    value="starter"
                    checked={form.planIntent === "starter"}
                    onChange={() => setForm({ ...form, planIntent: "starter" })}
                    className="mt-1 accent-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("Starter", "Starter")}</p>
                    <p className="text-xs text-muted-foreground">{t("Best for getting started.", "Ideal pour bien demarrer.")}</p>
                  </div>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${form.planIntent === "pro" ? selectedPlanClass : planClass}`}
                >
                  <input
                    type="radio"
                    name="planIntent"
                    value="pro"
                    checked={form.planIntent === "pro"}
                    onChange={() => setForm({ ...form, planIntent: "pro" })}
                    className="mt-1 accent-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("Pro", "Pro")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("Built for professionals automating at scale.", "Concu pour les pros qui automatisent a l echelle.")}
                    </p>
                  </div>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${form.planIntent === "growth" ? selectedPlanClass : planClass}`}
                >
                  <input
                    type="radio"
                    name="planIntent"
                    value="growth"
                    checked={form.planIntent === "growth"}
                    onChange={() => setForm({ ...form, planIntent: "growth" })}
                    className="mt-1 accent-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("Growth", "Growth")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("For growing teams with higher volume.", "Pour equipes en croissance avec plus de volume.")}
                    </p>
                  </div>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${form.planIntent === "business" ? selectedPlanClass : planClass}`}
                >
                  <input
                    type="radio"
                    name="planIntent"
                    value="business"
                    checked={form.planIntent === "business"}
                    onChange={() => setForm({ ...form, planIntent: "business" })}
                    className="mt-1 accent-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("Business", "Business")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("For teams running high-volume operations.", "Pour equipes qui gerent un fort volume operationnel.")}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background/70 p-4">
              <p className="text-sm font-semibold text-foreground">
                {t("Workspace invitation", "Invitation a l espace de travail")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "You are joining an existing workspace. No subscription checkout is required for this invite.",
                  "Vous rejoignez un espace existant. Aucun paiement d abonnement n est requis pour cette invitation."
                )}
              </p>
            </div>
          )}

          <label className="grid gap-2 text-sm font-medium text-foreground">
            {t("Name", "Nom")}
            <span className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                suppressHydrationWarning
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("Your full name", "Votre nom complet")}
                autoComplete="name"
                className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/40"
                required
              />
            </span>
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            {t("Email", "Email")}
            <span className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                suppressHydrationWarning
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
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
                suppressHydrationWarning
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={t("Create a secure password", "Creez un mot de passe securise")}
                autoComplete="new-password"
                className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-10 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/40"
                minLength={MIN_PASSWORD_LENGTH}
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
            <p className="text-xs text-muted-foreground">{PASSWORD_MIN_LENGTH_HELPER_TEXT}</p>
          </label>

          <p className="text-xs text-muted-foreground">
            {t(
              "Secure sign up. Two-factor authentication (2FA) can be enabled after sign-in from Settings.",
              "Inscription securisee. L authentification 2FA peut etre activee apres connexion dans Parametres."
            )}
          </p>

          <Button
            className="h-11 w-full bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-md shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:from-indigo-500 hover:to-indigo-400"
            loading={loading}
            type="submit"
          >
            {t("Create account", "Creer un compte")}
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/login" className="transition hover:text-indigo-500 dark:hover:text-indigo-300">
            {t("Sign in", "Se connecter")}
          </Link>
          <Link href="/faq" className="transition hover:text-indigo-500 dark:hover:text-indigo-300">
            {t("View FAQ", "Voir FAQ")}
          </Link>
        </div>
      </div>
    </div>
  );
}
