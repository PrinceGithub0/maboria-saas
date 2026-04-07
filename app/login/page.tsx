"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Lock, Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";
import { localizeServerMessage } from "@/lib/localization/server-messages";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const params = useSearchParams();
  const resetSuccess = params.get("reset") === "success";
  const inviteToken = params.get("invite") || undefined;
  const inviteEmail = params.get("email") || "";
  const inviteOrg = params.get("org") || "";
  const inviteRole = params.get("role") || "member";
  const inviteInviter = params.get("inviter") || "";
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  const { language, t } = useLanguage();
  const inviteMode = Boolean(inviteToken);
  const inviteRoleLabel =
    inviteRole === "billing_admin" ? "Billing Admin" : inviteRole === "admin" ? "Admin" : "Member";
  const inviteQuery = params.toString();
  const createAccountHref = inviteToken && inviteQuery ? `/create-account?${inviteQuery}` : "/create-account";
  const forgotPasswordHref = inviteToken && inviteQuery ? `/forgot-password?${inviteQuery}` : "/forgot-password";

  useEffect(() => {
    if (inviteEmail && !email) {
      setEmail(inviteEmail);
    }
  }, [email, inviteEmail]);

  const resolveLoginFailureMessage = (caught: unknown) => {
    const message = caught instanceof Error ? caught.message.trim() : "";
    if (!message) {
      return t("Sign in failed. Please try again.", "Connexion échouée. Réessayez.");
    }

    const normalized = message.toLowerCase();
    if (
      normalized.includes("failed to fetch") ||
      normalized.includes("fetch failed") ||
      normalized.includes("networkerror") ||
      normalized.includes("load failed")
    ) {
      return t({
        en: "The sign-in request could not reach the auth endpoint. If you are using a tunnel or custom dev URL, make sure NEXTAUTH_URL and APP_URL match the browser URL.",
        fr: "La requete de connexion n'a pas pu joindre l'endpoint d'authentification. Si vous utilisez un tunnel ou une URL de dev personnalisee, v?rifiez que NEXTAUTH_URL et APP_URL correspondent a l'URL du navigateur.",
        de: "The sign-in request could not reach the auth endpoint. If you are using a tunnel or custom dev URL, make sure NEXTAUTH_URL and APP_URL match the browser URL.",
        es: "The sign-in request could not reach the auth endpoint. If you are using a tunnel or custom dev URL, make sure NEXTAUTH_URL and APP_URL match the browser URL.",
        pt: "The sign-in request could not reach the auth endpoint. If you are using a tunnel or custom dev URL, make sure NEXTAUTH_URL and APP_URL match the browser URL.",
      });
    }

    if (normalized.includes("unexpected token") || normalized.includes("json")) {
      return t({
        en: "The auth endpoint returned an invalid response. Check the server log for the failing /api/auth request.",
        fr: "L'endpoint d'authentification a retourne une r?ponse invalide. V?rifiez le journal serveur pour la requete /api/auth en ?chec.",
        de: "The auth endpoint returned an invalid response. Check the server log for the failing /api/auth request.",
        es: "The auth endpoint returned an invalid response. Check the server log for the failing /api/auth request.",
        pt: "The auth endpoint returned an invalid response. Check the server log for the failing /api/auth request.",
      });
    }

    return message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
        otp: otp || undefined,
      });
      if (!res) {
        setError(t("Sign in failed. Please try again.", "Connexion \u00e9chou\u00e9e. R\u00e9essayez."));
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
            "Connexion réussie, mais le cookie de session n'a pas été défini. Vérifiez NEXTAUTH_URL et l'URL du navigateur."
          )
        );
        return;
      }
      const session = await sessionCheck.json().catch(() => null);
      if (!session?.user) {
        setError(
          t(
            "Sign in succeeded, but session is empty. Check NEXTAUTH_URL and clear cookies.",
            "Connexion réussie, mais la session est vide. Vérifiez NEXTAUTH_URL et supprimez les cookies."
          )
        );
        return;
      }
      const postLoginHref =
        String(session.user.role || "").toUpperCase() === "OPS_ADMIN" ? "/admin" : "/dashboard";
      if (inviteToken) {
        const inviteAcceptance = await fetch("/api/team/invite/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteToken }),
          credentials: "include",
        });
        const invitePayload = await inviteAcceptance.json().catch(() => ({}));
        if (!inviteAcceptance.ok) {
          setError(
            localizeServerMessage(
              invitePayload?.error,
              language,
              t(
                "Signed in, but the workspace invitation could not be accepted.",
                "Connexion r\u00e9ussie, mais l'invitation \u00e0 l'espace n'a pas pu \u00eatre accept\u00e9e."
              )
            )
          );
          return;
        }
        window.location.href =
          typeof invitePayload?.redirectTo === "string" && invitePayload.redirectTo
            ? invitePayload.redirectTo
            : postLoginHref;
        return;
      }
      window.location.href = postLoginHref;
    } catch (caught) {
      console.error("LOGIN_CLIENT_ERROR", caught);
      setError(resolveLoginFailureMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={
        inviteMode
          ? "min-h-screen bg-white text-foreground"
          : "flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground"
      }
    >
      <div
        className={
          inviteMode
            ? "grid min-h-screen w-full lg:grid-cols-[1.1fr_0.9fr]"
            : "w-full max-w-[460px] rounded-[28px] border border-border/70 bg-card p-8 shadow-[0_20px_48px_-24px_rgba(15,23,42,0.4)] sm:p-10"
        }
      >
        {inviteMode ? (
          <section className="relative hidden border-r border-sky-100/80 bg-[linear-gradient(135deg,#f7fbff_0%,#eef7ff_48%,#f5fbff_100%)] px-10 py-12 lg:flex lg:flex-col lg:justify-between xl:px-16">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_32%)]" />
            <div className="relative mx-auto w-full max-w-[580px] space-y-10">
              <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
                <Image src={logoSrc} alt="Maboria" fill sizes="40px" className="object-contain p-0 scale-110" priority />
              </div>
              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-700">MABORIA</p>
                <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight text-slate-950">
                  {inviteOrg
                    ? t(`Join ${inviteOrg}`, `Rejoindre ${inviteOrg}`)
                    : t("Join your workspace", "Rejoindre votre espace")}
                </h1>
                <p className="max-w-lg text-base leading-8 text-slate-600">
                  {t(
                    "This access flow is reserved for invited teammates. Sign in with your existing account and we will attach the workspace invite automatically.",
                    "Ce flux d'acc\u00e8s est r\u00e9serv\u00e9 aux membres invit\u00e9s. Connectez-vous avec votre compte existant et nous rattacherons automatiquement l'invitation."
                  )}
                </p>
              </div>
              <div className="grid gap-6 border-y border-sky-100/90 py-7 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t("Invited by", "Invite par")}</p>
                  <p className="text-xl font-semibold text-slate-950">{inviteInviter || "Maboria team"}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t("Access level", "Niveau d'acc\u00e8s")}</p>
                  <p className="text-xl font-semibold text-slate-950">{inviteRoleLabel}</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t("Invitation email", "Email de l'invitation")}</p>
                  <p className="break-all text-xl font-semibold text-slate-950">{inviteEmail || t("Use the invited address", "Utilisez l adresse invitee")}</p>
                </div>
              </div>
            </div>
            <div className="relative mx-auto mt-10 w-full max-w-[580px] border-t border-slate-200 pt-6 text-slate-950">
              <p className="text-[11px] uppercase tracking-[0.22em] text-sky-700">{t("Why sign in first", "Pourquoi se connecter d'abord")}</p>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
                {t(
                  "Existing teammates can accept the invite without creating a duplicate account. If you do not have an account yet, use the create account link below and the invite will stay attached.",
                  "Les membres existants peuvent accepter l'invitation sans creer de compte en double. Si vous n'avez pas encore de compte, utilisez le lien de cr?ation ci-dessous et l'invitation restera attachee."
                )}
              </p>
            </div>
          </section>
        ) : null}

        <section className={inviteMode ? "flex min-h-screen flex-col justify-center bg-white px-5 py-10 sm:px-8 lg:px-12 xl:px-16" : ""}>
          <div className={inviteMode ? "mx-auto w-full max-w-[520px]" : ""}>
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
                    "Connectez-vous pour gérer factures, automatisation et facturation."
                  )}
                </p>
              </div>
            </div>

            {resetSuccess && (
              <Alert className="mt-5" variant="success">
                {t(
                  "Your password has been updated successfully. You can now sign in.",
                  "Votre mot de passe a été mis à jour avec succès. Vous pouvez maintenant vous connecter."
                )}
              </Alert>
            )}
            {inviteToken && (
              <div className="mt-5 space-y-4 border-y border-sky-100 py-5 text-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                    {t("Workspace invite", "Invitation espace")}
                  </span>
                  <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    {inviteRoleLabel}
                  </span>
                </div>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                    {t("Accept your team access", "Acceptez votre acc\u00e8s \u00e0 l'\u00e9quipe")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {inviteOrg
                      ? t(
                          `Sign in to join ${inviteOrg} on Maboria.`,
                          `Connectez-vous pour rejoindre ${inviteOrg} sur Maboria.`
                        )
                      : t(
                          "Sign in to accept your workspace invitation.",
                          "Connectez-vous pour accepter votre invitation \u00e0 l'espace de travail."
                        )}
                  </p>
                </div>
                <div className="grid gap-4 text-sm sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{t("Invited by", "Invite par")}</p>
                    <p className="font-medium text-slate-900">{inviteInviter || "Maboria team"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{t("Email", "Email")}</p>
                    <p className="break-all font-medium text-slate-900">{inviteEmail || t("Use the invited address", "Utilisez l adresse invitee")}</p>
                  </div>
                </div>
              </div>
            )}
            {params.get("message") && <Alert className="mt-5" variant="success">{params.get("message")}</Alert>}
            {error && (
              <Alert className="mt-5" variant="error">
                {localizeServerMessage(error, language, t("Sign in failed. Please try again.", "Connexion \u00e9chou\u00e9e. R\u00e9essayez."))}
              </Alert>
            )}

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
                readOnly={Boolean(inviteMode && inviteEmail)}
                className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/40"
                required
              />
            </span>
            {inviteMode && inviteEmail ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  "This invitation is tied to the invited email address.",
                  "Cette invitation est liee a l adresse email invitee."
                )}
              </p>
            ) : null}
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
              <Link href={createAccountHref} className="transition hover:text-indigo-500 dark:hover:text-indigo-300">
                {t("Create account", "Creer un compte")}
              </Link>
              <Link href={forgotPasswordHref} className="transition hover:text-indigo-500 dark:hover:text-indigo-300">
                {t("Forgot password?", "Mot de passe oublié ?")}
              </Link>
            </div>
            <div className="mt-3 text-center text-sm text-muted-foreground">
              <Link href="/faq" className="transition hover:text-indigo-500 dark:hover:text-indigo-300">
                {t("View FAQ", "Voir la FAQ")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

