"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import { localizeServerMessage } from "@/lib/localization/server-messages";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_MIN_LENGTH_ERROR,
  PASSWORD_MIN_LENGTH_HELPER_TEXT,
  validatePasswordPolicy,
} from "@/lib/password-policy";

type ValidationState = "checking" | "valid" | "invalid";

type PasswordStrength = "Empty" | "Weak" | "Medium" | "Strong";

function getPasswordStrength(password: string): { key: PasswordStrength; width: string; tone: string } {
  if (!password) {
    return { key: "Empty", width: "0%", tone: "bg-slate-300" };
  }

  const hasMinimumLength = password.length >= MIN_PASSWORD_LENGTH;
  const hasMixedCase = /[A-Z]/.test(password) && /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const completedChecks = [hasMinimumLength, hasMixedCase, hasNumber].filter(Boolean).length;

  if (validatePasswordPolicy(password)) {
    return { key: "Strong", width: "100%", tone: "bg-emerald-500" };
  }

  if (completedChecks >= 2) {
    return { key: "Medium", width: "65%", tone: "bg-amber-500" };
  }

  return { key: "Weak", width: "35%", tone: "bg-rose-500" };
}

function getPasswordStrengthLabel(password: string, t: ReturnType<typeof useLanguage>["t"]) {
  const strength = getPasswordStrength(password).key;
  if (strength === "Empty") return t("Empty", "Vide", "Leer", "Vacio", "Vazio");
  if (strength === "Weak") return t("Weak", "Faible", "Schwach", "Debil", "Fraca");
  if (strength === "Medium") return t("Medium", "Moyen", "Mittel", "Media", "Media");
  return t("Strong", "Fort", "Stark", "Fürte", "Forte");
}

export default function ResetPasswordPage() {
  const { language, t } = useLanguage();
  const token = useSearchParams().get("token") || "";
  const router = useRouter();
  const [validationState, setValidationState] = useState<ValidationState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  const strength = useMemo(
    () => {
      const passwordStrength = getPasswordStrength(password);
      return {
        label: getPasswordStrengthLabel(password, t),
        width: passwordStrength.width,
        tone: passwordStrength.tone,
      };
    },
    [password, t]
  );

  useEffect(() => {
    let cancelled = false;

    async function validateToken() {
      if (!token) {
        if (!cancelled) setValidationState("invalid");
        return;
      }
      try {
        const res = await fetch("/api/auth/validate-reset-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = await res.json().catch(() => ({ valid: false }));
        if (!cancelled) {
          setValidationState(payload.valid ? "valid" : "invalid");
        }
      } catch {
        if (!cancelled) setValidationState("invalid");
      }
    }

    validateToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validatePasswordPolicy(password)) {
      setError(PASSWORD_MIN_LENGTH_ERROR);
      return;
    }
    if (password !== confirm) {
      setError(t("Passwords do not match.", "Les mots de passe ne correspondent pas."));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirm }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(localizeServerMessage(payload?.error, language, t("Reset failed. Please request a new link.", "La r\u00e9initialisation a \u00e9chou\u00e9. Demandez un nouveau lien.")));
        return;
      }
      router.push("/login?reset=success");
    } catch {
      setError(t("Reset failed. Please request a new link.", "La r?initialisation a échoué. Demandez un nouveau lien."));
    } finally {
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
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">MABORIA</p>
        </div>

        {validationState === "checking" && (
          <div className="mt-5 space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {t("Verifying link", "Vérification du lien")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("Please wait while we verify your reset link.", "Veuillez patienter pendant la verification du lien.")}
            </p>
          </div>
        )}

        {validationState === "invalid" && (
          <div className="mt-5 space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {t("Reset link expired", "Lien expire")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "This password reset link is invalid or has expired. Please request a new one.",
                "Ce lien de réinitialisation est invalide ou expiré. Veuillez en demander un nouveau."
              )}
            </p>
            <Link href="/forgot-password">
              <Button className="h-11 w-full bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-md shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:from-indigo-500 hover:to-indigo-400">
                {t("Request new link", "Demander un nouveau lien")}
              </Button>
            </Link>
          </div>
        )}

        {validationState === "valid" && (
          <>
            <div className="mt-5 space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                {t("Create new password", "Créer un nouveau mot de passe")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("Choose a strong password for your account.", "Choisissez un mot de passe fort pour votre compte.")}
              </p>
            </div>

            {error && (
              <Alert className="mt-5" variant="error">
                {localizeServerMessage(error, language, t("Reset failed. Please request a new link.", "La r\u00e9initialisation a \u00e9chou\u00e9. Demandez un nouveau lien."))}
              </Alert>
            )}

            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                {t("Password", "Mot de passe")}
                <span className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-10 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/40"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
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

              <div className="space-y-2">
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className={`h-2 rounded-full ${strength.tone}`} style={{ width: strength.width }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("Strength:", "Force:")} {t(strength.label, strength.label === "Weak" ? "Faible" : strength.label === "Medium" ? "Moyenne" : strength.label === "Strong" ? "Forte" : "Vide")}
                </p>
              </div>

              <label className="grid gap-2 text-sm font-medium text-foreground">
                {t("Confirm password", "Confirmer le mot de passe")}
                <span className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    autoComplete="new-password"
                    className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-10 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300/40"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                  />
                  <button
                    type="button"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                    onClick={() => setShowConfirm((prev) => !prev)}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>

              <Button
                className="h-11 w-full bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-md shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:from-indigo-500 hover:to-indigo-400"
                loading={loading}
                type="submit"
              >
                {t("Update password", "Mettre ? jour le mot de passe")}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
