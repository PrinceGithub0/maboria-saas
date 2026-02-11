"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import Image from "next/image";
import { useLanguage } from "@/components/providers/language-provider";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
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
      router.push("/dashboard");
    } catch {
      setError(t("Sign in failed. Please try again.", "Connexion echouee. Reessayez."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl max-md:max-w-none">
          <div className="flex items-center gap-2">
            <div className="relative h-9 w-9 overflow-hidden rounded-xl border border-border bg-card">
              <Image src={logoSrc} alt="Maboria" fill sizes="36px" className="object-contain p-0 scale-110" priority />
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Maboria</p>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{t("Welcome back", "Bon retour")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Sign in to manage automations and billing.", "Connectez-vous pour gerer automatisations et facturation.")}
        </p>
        {params.get("message") && <Alert variant="success">{params.get("message")}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <Input
            label={t("Email", "Email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label={t("Password", "Mot de passe")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Input
            label={t("2FA code (if enabled)", "Code 2FA (si active)")}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder={t("123456 or backup code", "123456 ou code de secours")}
          />
          <Button className="w-full" loading={loading} type="submit">
            {t("Sign in", "Se connecter")}
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/signup" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200">
            {t("Create account", "Creer un compte")}
          </Link>
          <Link href="/forgot" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200">
            {t("Forgot password", "Mot de passe oublie")}
          </Link>
        </div>
        <div className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/faq" className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200">
            {t("View FAQ", "Voir la FAQ")}
          </Link>
        </div>
      </div>
    </div>
  );
}
