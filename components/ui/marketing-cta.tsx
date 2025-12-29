"use client";

import Link from "next/link";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { TRIAL_DAYS } from "@/lib/pricing";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
};

function isCanceledOrExpired(subs: any[]) {
  if (!subs.length) return false;
  const now = Date.now();
  const hasActiveOrTrial = subs.some((sub) => {
    if (sub?.status === "ACTIVE") return true;
    if (sub?.status === "TRIALING") {
      if (!sub?.trialEndsAt) return true;
      const trialEnd = new Date(sub.trialEndsAt).getTime();
      return trialEnd >= now;
    }
    return false;
  });
  const hasCanceled = subs.some((sub) => ["CANCELED", "INACTIVE"].includes(sub?.status));
  const hasPastDue = subs.some((sub) => sub?.status === "PAST_DUE");
  const hasExpiredTrial = subs.some((sub) => {
    if (sub?.status !== "TRIALING" || !sub?.trialEndsAt) return false;
    return new Date(sub.trialEndsAt).getTime() < now;
  });

  return !hasActiveOrTrial && (hasCanceled || hasPastDue || hasExpiredTrial);
}

type Variant = "hero" | "header" | "mobileCard" | "mobileBar";

export function MarketingCta({ variant }: { variant: Variant }) {
  const { data: session } = useSession();
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
            <Button variant="ghost">View plans</Button>
          </Link>
          <Link href="/dashboard/payments">
            <Button>Resubscribe</Button>
          </Link>
        </>
      );
    }
    return (
      <>
        <Link href="/login">
          <Button variant="ghost">Login</Button>
        </Link>
        <Link href="/signup">
          <Button>Get Started</Button>
        </Link>
      </>
    );
  }

  if (variant === "mobileCard") {
    if (isCanceledOnly) {
      return (
        <div className="mt-3 flex flex-col gap-2">
          <Link href="/dashboard/payments">
            <Button className="w-full">Resubscribe</Button>
          </Link>
          <Link href="/dashboard/subscription">
            <Button variant="secondary" className="w-full">
              View plans
            </Button>
          </Link>
        </div>
      );
    }
    return (
      <div className="mt-3 flex flex-col gap-2">
        <Link href="/signup">
          <Button className="w-full">Create free account</Button>
        </Link>
        <Link href="/login">
          <Button variant="secondary" className="w-full">
            Sign in
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
            <Button className="h-11 w-full">Resubscribe</Button>
          </Link>
          <Link href="/dashboard/subscription" className="flex-1">
            <Button variant="secondary" className="h-11 w-full">
              View plans
            </Button>
          </Link>
        </div>
      );
    }
    return (
      <div className="mx-auto flex max-w-[420px] items-center gap-2 max-md:mx-0 max-md:w-full max-md:max-w-none">
        <Link href="/signup" className="flex-1">
          <Button className="h-11 w-full">Get started</Button>
        </Link>
        <Link href="/login" className="flex-1">
          <Button variant="secondary" className="h-11 w-full">
            Sign in
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
              Resubscribe
            </Button>
          </Link>
          <Link href="/dashboard/subscription">
            <Button variant="secondary" size="md" className="max-md:w-full">
              View plans
            </Button>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground max-md:text-xs">
          Your trial ended or your subscription was canceled. Choose a plan to continue.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-3 max-md:flex-col max-md:items-stretch">
        <Link href="/signup">
          <Button size="md" className="max-md:w-full">
            Start free trial
          </Button>
        </Link>
        <Link href="/pricing">
          <Button variant="secondary" size="md" className="max-md:w-full">
            View pricing
          </Button>
        </Link>
      </div>
      <p className="text-sm text-muted-foreground max-md:text-xs">
        No credit card required. Trial is {TRIAL_DAYS} days.
      </p>
    </>
  );
}
