"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/components/providers/language-provider";
import { useSearchParams } from "next/navigation";

export default function SignupPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    planIntent: "starter",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
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
    setLoading(true);
    setError(null);
    try {
      const email = form.email.toLowerCase().trim();
      const locale =
        typeof navigator !== "undefined" && navigator.language ? navigator.language : undefined;
      const timeZone =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined;
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
      setSuccess(true);

      const result = await signIn("credentials", {
        redirect: false,
        email,
        password: form.password,
        callbackUrl: "/checkout",
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
        window.location.href = result?.url || "/checkout";
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
                <p className="text-lg font-semibold text-foreground">
                  {t("Create your account", "Creez votre compte")}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                "Start automating invoices, subscriptions, and customer updates in minutes.",
                "Automatisez factures, abonnements et mises a jour clients en quelques minutes."
              )}
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
                {t("Trusted billing", "Facturation fiable")}
              </Badge>
              <Badge
                variant="default"
                className="text-[10px] uppercase tracking-[0.2em] !bg-slate-900 !text-white !border-slate-900 dark:!bg-slate-800 dark:!text-slate-100 dark:!border-slate-700"
              >
                {t("AI automation", "Automatisation IA")}
              </Badge>
              <Badge
                variant="default"
                className="text-[10px] uppercase tracking-[0.2em] !bg-slate-900 !text-white !border-slate-900 dark:!bg-slate-800 dark:!text-slate-100 dark:!border-slate-700"
              >
                {t("Team-ready", "Equipe prete")}
              </Badge>
            </div>
            {error && <Alert variant="error">{error}</Alert>}
            {success && (
              <Alert variant="success">
                {t(
                  "Account created. Redirecting you to checkout.",
                  "Compte cree. Redirection vers le paiement."
                )}
                {userId ? ` Your user ID: ${userId}.` : ""}
              </Alert>
            )}
            {success && userId && (
              <p className="text-xs text-muted-foreground">
                {t("User ID:", "ID utilisateur:")} <span className="font-mono text-foreground">{userId}</span>
              </p>
            )}
            {success && (
              <div className="rounded-2xl border border-border bg-card/60 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {t("Continue to checkout", "Continuer vers le paiement")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    "If you are not redirected automatically, continue to payment to activate your subscription.",
                    "Si vous n etes pas redirige, poursuivez le paiement pour activer votre abonnement."
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/checkout">
                    <Button size="sm">{t("Go to checkout", "Aller au paiement")}</Button>
                  </Link>
                  <Link href="/login">
                    <Button size="sm" variant="secondary">
                      {t("Sign in again", "Se connecter a nouveau")}
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  {t("Choose how to start", "Choisissez comment demarrer")}
                </p>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
                <input
                  type="radio"
                  name="planIntent"
                  value="starter"
                  checked={form.planIntent === "starter"}
                  onChange={() => setForm({ ...form, planIntent: "starter" })}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("Subscribe to Starter", "S'abonner a Starter")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("Best for founders getting started.", "Ideal pour les fondateurs." )}
                  </p>
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
                  <p className="text-sm font-medium text-foreground">
                    {t("Subscribe to Pro", "S'abonner a Pro")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Unlock AI workflows and WhatsApp automation.",
                      "Debloquez IA et automatisation WhatsApp."
                    )}
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
                <input
                  type="radio"
                  name="planIntent"
                  value="growth"
                  checked={form.planIntent === "growth"}
                  onChange={() => setForm({ ...form, planIntent: "growth" })}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("Subscribe to Growth", "S'abonner a Growth")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Best for growing operations with higher usage limits.",
                      "Ideal pour operations en croissance avec limites plus elevees."
                    )}
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
                <input
                  type="radio"
                  name="planIntent"
                  value="business"
                  checked={form.planIntent === "business"}
                  onChange={() => setForm({ ...form, planIntent: "business" })}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("Subscribe to Business", "S'abonner a Business")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Best for teams of 1-10 scaling operations.",
                      "Ideal pour equipes de 1 a 10 en croissance."
                    )}
                  </p>
                </div>
              </label>
            </div>
          </div>
          <Input
            label={t("Name", "Nom")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label={t("Email", "Email")}
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label={t("Password", "Mot de passe")}
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "Two-factor authentication (2FA) can be enabled after sign-in from Settings.",
              "L'authentification 2FA peut etre activee apres connexion dans Parametres."
            )}
          </p>
          <Button className="w-full" loading={loading} type="submit">
            {t("Create account", "Creer un compte")}
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/login" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200">
            {t("Sign in", "Se connecter")}
          </Link>
          <Link href="/faq" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200">
            {t("View FAQ", "Voir FAQ")}
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
}
