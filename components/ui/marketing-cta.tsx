"use client";

import Link from "next/link";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
};

function isCanceledOrExpired(subs: any[]) {
  if (!subs.length) return false;
  const hasActive = subs.some((sub) => sub?.status === "ACTIVE");
  const hasCanceled = subs.some((sub) => ["CANCELED", "INACTIVE"].includes(sub?.status));
  const hasPastDue = subs.some((sub) => sub?.status === "PAST_DUE");

  return !hasActive && (hasCanceled || hasPastDue);
}

type Variant = "hero" | "header" | "mobileCard" | "mobileBar";

export function MarketingCta({ variant }: { variant: Variant }) {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const { data: me } = useSWR(session ? "/api/user/me" : null, fetcher, {
    shouldRetryOnError: false,
  });
  const subs = Array.isArray(me?.subscriptions) ? me.subscriptions : [];
  const isCanceledOnly = Boolean(session && isCanceledOrExpired(subs));

  if (variant === "header") {
    if (isCanceledOnly) {
      return (
        <>
          <Link href="/dashboard/subscription">
            <Button variant="ghost">{t("View plans", "Voir les offres")}</Button>
          </Link>
          <Link href="/dashboard/payments">
            <Button>{t("Resubscribe", "Se reabonner")}</Button>
          </Link>
        </>
      );
    }
    return (
      <>
        <Link href="/login">
          <Button variant="ghost">{t("Login", "Se connecter")}</Button>
        </Link>
        <Link href="/signup">
          <Button>{t("Get started", "Commencer")}</Button>
        </Link>
      </>
    );
  }

  if (variant === "mobileCard") {
    if (isCanceledOnly) {
      return (
        <div className="mt-3 flex flex-col gap-2">
          <Link href="/dashboard/payments">
            <Button className="w-full">{t("Resubscribe", "Se reabonner")}</Button>
          </Link>
          <Link href="/dashboard/subscription">
            <Button variant="secondary" className="w-full">
              {t("View plans", "Voir les offres")}
            </Button>
          </Link>
        </div>
      );
    }
    return (
      <div className="mt-3 flex flex-col gap-2">
        <Link href="/signup">
          <Button className="w-full">{t("Create account", "Creer un compte")}</Button>
        </Link>
        <Link href="/login">
          <Button variant="secondary" className="w-full">
            {t("Sign in", "Se connecter")}
          </Button>
        </Link>
      </div>
    );
  }

  if (variant === "mobileBar") {
    if (isCanceledOnly) {
      return (
        <div className="mx-auto flex max-w-[420px] items-center gap-2 max-md:mx-0 max-md:w-full max-md:max-w-none">
          <Link href="/dashboard/payments" className="flex-1">
            <Button className="h-11 w-full">{t("Resubscribe", "Se reabonner")}</Button>
          </Link>
          <Link href="/dashboard/subscription" className="flex-1">
            <Button variant="secondary" className="h-11 w-full">
              {t("View plans", "Voir les offres")}
            </Button>
          </Link>
        </div>
      );
    }
    return (
      <div className="mx-auto flex max-w-[420px] items-center gap-2 max-md:mx-0 max-md:w-full max-md:max-w-none">
        <Link href="/signup" className="flex-1">
          <Button className="h-11 w-full">{t("Get started", "Commencer")}</Button>
        </Link>
        <Link href="/login" className="flex-1">
          <Button variant="secondary" className="h-11 w-full">
            {t("Sign in", "Se connecter")}
          </Button>
        </Link>
      </div>
    );
  }

  if (isCanceledOnly) {
    return (
      <>
        <div className="flex flex-wrap gap-3 max-md:flex-col max-md:items-stretch">
          <Link href="/dashboard/payments">
            <Button size="md" className="max-md:w-full">
              {t("Resubscribe", "Se reabonner")}
            </Button>
          </Link>
          <Link href="/dashboard/subscription">
            <Button variant="secondary" size="md" className="max-md:w-full">
              {t("View plans", "Voir les offres")}
            </Button>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground max-md:text-xs">
          {t(
            "Your subscription is canceled or inactive. Choose a plan to continue.",
            "Votre abonnement est annule ou inactif. Choisissez une offre."
          )}
        </p>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-3 max-md:flex-col max-md:items-stretch">
        <Link href="/signup">
          <Button size="md" className="max-md:w-full">
            {t("Get started", "Commencer")}
          </Button>
        </Link>
        <Link href="/pricing">
          <Button variant="secondary" size="md" className="max-md:w-full">
            {t("View pricing", "Voir les tarifs")}
          </Button>
        </Link>
      </div>
    </>
  );
}
