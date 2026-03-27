"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { Lock, Mail, User, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";
import { localizeServerMessage } from "@/lib/localization/server-messages";
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
  const { language, t } = useLanguage();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") || undefined;
  const inviteEmail = searchParams.get("email") || "";
  const inviteOrg = searchParams.get("org") || "";
  const inviteRoleParam = searchParams.get("role");
  const inviteRole = inviteRoleParam || "member";
  const inviteInviter = searchParams.get("inviter") || "";
  const hasInviteContext = Boolean(inviteToken || inviteEmail || inviteOrg || inviteInviter || inviteRoleParam);
  const inviteLinkBroken = hasInviteContext && !inviteToken;
  const inviteMode = hasInviteContext;
  const inviteRoleLabel =
    inviteRole === "billing_admin" ? "Billing Admin" : inviteRole === "admin" ? "Admin" : "Member";
  const inviteQuery = searchParams.toString();
  const signInHref = inviteToken && inviteQuery ? `/login?${inviteQuery}` : "/login";

  useEffect(() => {
    if (inviteEmail && !form.email) {
      setForm((prev) => ({ ...prev, email: inviteEmail }));
    }
  }, [inviteEmail, form.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (inviteLinkBroken) {
      setError(
        t(
          "This invite link is incomplete. Open the latest invite email or ask the workspace owner to resend it.",
          "Ce lien d invitation est incomplet. Ouvrez le dernier email d invitation ou demandez au proprietaire de le renvoyer."
        )
      );
      return;
    }
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setError(PASSWORD_MIN_LENGTH_ERROR);
      return;
    }
    setLoading(true);
    try {
      const email = form.email.toLowerCase().trim();
      const locale = typeof navigator !== "undefined" && navigator.language ? navigator.language : undefined;
      const timeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
      const nextRedirectTarget = inviteToken ? "/dashboard" : "/checkout";
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email, inviteToken, locale, timeZone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(localizeServerMessage(data.error, language, t("Signup failed", "Echec de l inscription")));
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
            "Compte cree, mais connexion échouée. Veuillez vous connecter."
          )
        );
        return;
      }
      const sessionCheck = await fetch("/api/auth/session", { credentials: "include" });
      if (!sessionCheck.ok) {
        setError(
          t(
            "Account created, but the session cookie was not set. Check NEXTAUTH_URL and your browser URL, then sign in again.",
            "Compte cree, mais le cookie de session n'a pas ?t? defini. Verifiez NEXTAUTH_URL et l URL du navigateur, puis reconnectez-vous."
          )
        );
        return;
      }
      const session = await sessionCheck.json().catch(() => null);
      if (!session?.user) {
        setError(
          t(
            "Account created, but the session is empty. Check NEXTAUTH_URL, clear cookies, then sign in again.",
            "Compte cree, mais la session est vide. Verifiez NEXTAUTH_URL, supprimez les cookies, puis reconnectez-vous."
          )
        );
        return;
      }
      if (typeof window !== "undefined") {
        const finalRedirect = inviteToken || data.joinedWorkspace ? callbackUrl : result?.url || callbackUrl;
        window.location.href = finalRedirect;
      }
    } catch {
      setError(
        t(
          "Signup succeeded, but automatic sign-in failed. Please sign in to continue.",
          "Inscription reussie, mais connexion automatique échouée. Veuillez vous connecter."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const selectedPlanClass = "border-indigo-500 bg-indigo-500/5 ring-2 ring-indigo-500/20";
  const planClass = "border-border bg-background/70 hover:border-indigo-300/70";

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
            : "w-full max-w-[560px] rounded-[30px] border border-border/70 bg-card p-8 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)] sm:p-10"
        }
      >
        {inviteMode ? (
          <section className="relative hidden border-r border-sky-100/80 bg-[linear-gradient(135deg,#f8fbff_0%,#edf6ff_48%,#f7fbff_100%)] px-10 py-12 lg:flex lg:flex-col lg:justify-between xl:px-16">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.15),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_30%)]" />
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
                    "This workspace access is separate from the normal subscriber signup flow. Create your account here and your invite will be attached automatically.",
                    "Cet accès à l'espace est distinct du flux d inscription normal des abonnes. Creez votre compte ici et votre invitation sera rattachee automatiquement."
                  )}
                </p>
              </div>
              <div className="grid gap-6 border-y border-sky-100/90 py-7 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t("Invited by", "Invite par")}</p>
                  <p className="text-xl font-semibold text-slate-950">{inviteInviter || "Maboria team"}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t("Access level", "Niveau d accès")}</p>
                  <p className="text-xl font-semibold text-slate-950">{inviteRoleLabel}</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t("Invitation email", "Email de l'invitation")}</p>
                  <p className="break-all text-xl font-semibold text-slate-950">{inviteEmail}</p>
                </div>
              </div>
            </div>
            <div className="relative mx-auto mt-10 w-full max-w-[580px] border-t border-slate-200 pt-6">
              <p className="text-[11px] uppercase tracking-[0.22em] text-sky-700">{t("Existing account", "Compte existant")}</p>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">
                {t(
                  "Already on Maboria? Use sign in instead. We will keep this workspace invite attached and accept it after authentication.",
                  "Vous avez déjà un compte Maboria ? Connectez-vous plutot. Nous conserverons cette invitation et l accepterons apres authentification."
                )}
              </p>
              <div className="mt-5">
                <Link href={signInHref} className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                  {t("Already have an account? Sign in", "Vous avez déjà un compte ? Connectez-vous")}
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section className={inviteMode ? "flex min-h-screen flex-col justify-center bg-white px-5 py-10 sm:px-8 lg:px-12 xl:px-16" : ""}>
          <div className={inviteMode ? "mx-auto w-full max-w-[560px]" : ""}>
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

            {error && (
              <Alert className="mt-5" variant="error">
                {localizeServerMessage(error, language, t("Signup failed", "Echec de l inscription"))}
              </Alert>
            )}
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
                    joinedWorkspace ? "Continuer vers l'espace" : "Continuer vers le paiement"
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
                        joinedWorkspace ? "Aller à l'espace" : "Aller au paiement"
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
          {!inviteMode ? (
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
                      {t("For growing teams with higher volume.", "Pour équipes en croissance avec plus de volume.")}
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
                      {t("For teams running high-volume operations.", "Pour équipes qui gèrent un fort volume operationnel.")}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-5 border-y border-sky-100 py-5 text-slate-900">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                  {t("Workspace invite", "Invitation espace")}
                </span>
                <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  {inviteRoleLabel}
                </span>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  {inviteOrg
                    ? t(`Join ${inviteOrg}`, `Rejoindre ${inviteOrg}`)
                    : t("Join your workspace", "Rejoindre votre espace")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t(
                    "Create your account to accept this invite. No subscription checkout is required for invited teammates.",
                    "Creez votre compte pour accepter cette invitation. Aucun paiement d abonnement n est requis pour les membres invites."
                  )}
                </p>
              </div>
              <div className="grid gap-4 text-sm sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{t("Invited by", "Invite par")}</p>
                  <p className="font-medium text-slate-900">{inviteInviter || "Maboria team"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{t("Access", "Accès")}</p>
                  <p className="font-medium text-slate-900">{inviteRoleLabel}</p>
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{t("Invitation email", "Email de l'invitation")}</p>
                  <p className="break-all font-medium text-slate-900">{inviteEmail}</p>
                </div>
                <div className="space-y-2 border-t border-emerald-100 pt-4 sm:col-span-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">{t("Already registered?", "Déjà inscrit ?")}</p>
                  <p className="text-sm leading-6 text-slate-700">
                    {t(
                      "If you already have a Maboria account, sign in instead and we will attach this invite automatically.",
                      "Si vous avez déjà un compte Maboria, connectez-vous plutot et nous rattacherons automatiquement cette invitation."
                    )}
                  </p>
                  <div>
                    <Link href={signInHref} className="text-sm font-semibold text-sky-700 transition hover:text-sky-800">
                      {t("Already have an account? Sign in", "Vous avez déjà un compte ? Connectez-vous")}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {inviteLinkBroken ? (
            <Alert variant="error">
              {t(
                "This invite opened without its secure token. Do not continue with a normal signup. Open the latest invite email or ask for a resend.",
                "Cette invitation s est ouverte sans son jeton securise. Ne poursuivez pas une inscription normale. Ouvrez le dernier email d invitation ou demandez un renvoi."
              )}
            </Alert>
          ) : null}

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
                readOnly={Boolean(inviteMode && inviteEmail)}
                className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/40"
                required
              />
            </span>
            {inviteMode && inviteEmail ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  "This workspace invite is tied to the invited email address.",
                  "Cette invitation d espace est liee a l adresse email invitee."
                )}
              </p>
            ) : null}
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
              "Inscription securisee. L authentification 2FA peut être activee apres connexion dans Paramêtres."
            )}
          </p>

          <Button
            className="h-11 w-full bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-md shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:from-indigo-500 hover:to-indigo-400"
            loading={loading}
            type="submit"
            disabled={inviteLinkBroken}
          >
            {hasInviteContext
              ? t("Create account and join workspace", "Creer un compte et rejoindre l'espace")
              : t("Create account", "Creer un compte")}
          </Button>
            </form>

            <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
              <Link href={signInHref} className="transition hover:text-indigo-500 dark:hover:text-indigo-300">
                {t("Sign in", "Se connecter")}
              </Link>
              <Link href="/faq" className="transition hover:text-indigo-500 dark:hover:text-indigo-300">
                {t("View FAQ", "Voir FAQ")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
