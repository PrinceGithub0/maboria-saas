"use client";
import { Sidebar } from "@/components/ui/sidebar";
import { Navbar } from "@/components/ui/navbar";
import { Announcement } from "@/components/ui/announcement";
import { TourOverlay } from "@/components/ui/tour";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { Bot, CreditCard, LayoutDashboard, Settings } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AppShell({
  children,
  role,
  announcement,
}: {
  children: React.ReactNode;
  role?: string;
  announcement?: string;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { data: me } = useSWR(session ? "/api/user/me" : null, fetcher, {
    shouldRetryOnError: false,
  });
  const effectiveRole = role || session?.user?.role;
  const plan = typeof me?.plan === "string" ? me.plan : undefined;
  const subs = Array.isArray(me?.subscriptions) ? me.subscriptions : [];
  const now = Date.now();
  const hasActiveOrTrial = subs.some((sub: any) => {
    if (sub?.status === "ACTIVE") return true;
    if (sub?.status === "TRIALING") {
      if (!sub?.trialEndsAt) return true;
      const trialEnd = new Date(sub.trialEndsAt).getTime();
      return trialEnd >= now;
    }
    return false;
  });
  const hasCanceled = subs.some((sub: any) => ["CANCELED", "INACTIVE"].includes(sub?.status));
  const hasPastDue = subs.some((sub: any) => sub?.status === "PAST_DUE");
  const hasExpiredTrial = subs.some((sub: any) => {
    if (sub?.status !== "TRIALING" || !sub?.trialEndsAt) return false;
    return new Date(sub.trialEndsAt).getTime() < now;
  });
  const isCanceledOnly =
    subs.length > 0 && !hasActiveOrTrial && (hasCanceled || hasPastDue || hasExpiredTrial);
  const billingLocked = Boolean(session && plan === "free" && effectiveRole !== "ADMIN");
  const billingAllowed =
    pathname.startsWith("/dashboard/payments") || pathname.startsWith("/dashboard/subscription");
  const isMarketingHome = pathname === "/";
  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot") ||
    pathname.startsWith("/reset");
  const isAppRoute = pathname === "/" || pathname.startsWith("/dashboard") || pathname.startsWith("/admin");
  const showMobileNav = pathname.startsWith("/dashboard");

  if (isAuthRoute || !isAppRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <Announcement message={announcement} />
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar role={role} />
        <div className="flex min-h-screen flex-1 flex-col bg-background">
          <Navbar />
          <main className="flex-1 overflow-y-auto px-6 py-6 max-md:px-4 max-md:pt-4 max-md:pb-28 max-md:space-y-6 max-md:overflow-x-hidden">
            {isMarketingHome && billingLocked && isCanceledOnly ? (
              <div className="mb-6 rounded-2xl border border-amber-500 bg-amber-200 px-5 py-4 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-900 dark:text-amber-200">
                      Subscription needed
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-amber-100">
                      Your trial ended or your subscription was cancelled. Choose a plan to regain access.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link href="/dashboard/payments">
                      <Button size="sm">Resubscribe</Button>
                    </Link>
                    <Link href="/dashboard/subscription">
                      <Button size="sm" variant="secondary">
                        View plans
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="relative max-md:space-y-8">
              <div
                className={`${
                  billingLocked && isCanceledOnly && !billingAllowed && !isMarketingHome
                    ? "pointer-events-none opacity-50 blur-[1px]"
                    : ""
                } max-md:rounded-[32px] max-md:border max-md:border-border max-md:p-4 max-md:shadow-[0_22px_50px_rgba(15,23,42,0.12)] dark:max-md:shadow-[0_26px_60px_rgba(0,0,0,0.45)]`}
              >
                {children}
              </div>
              {billingLocked && isCanceledOnly && !billingAllowed && !isMarketingHome ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full max-w-xl rounded-2xl border border-border bg-card/80 p-6 text-center shadow-xl max-md:w-full max-md:max-w-none">
                    <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
                      Subscription inactive
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-foreground">
                      Dashboard is locked until you resubscribe
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Your subscription is canceled or your trial has ended. You can view the dashboard, but actions are disabled
                      until you choose a new plan.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-3">
                      <Link href="/dashboard/payments">
                        <Button>Resubscribe</Button>
                      </Link>
                      <Link href="/dashboard/subscription">
                        <Button variant="secondary">View subscription</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ) : null}
              {billingLocked && !isCanceledOnly && !billingAllowed && !isMarketingHome ? (
                <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card/70 p-6 text-center max-md:mx-0 max-md:w-full max-md:max-w-none">
                  <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
                    Billing required
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold text-foreground">Add a payment method to continue</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your account is not active yet. Please add a valid payment method to unlock the app.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-3">
                    <Link href="/dashboard/payments">
                      <Button>Go to billing</Button>
                    </Link>
                    <Link href="/dashboard/subscription">
                      <Button variant="secondary">View subscription</Button>
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          </main>
        </div>
      </div>
      {showMobileNav ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-[420px] items-center justify-between rounded-3xl bg-card/80 px-3 py-2 shadow-[0_12px_24px_rgba(15,23,42,0.15)] max-md:mx-0 max-md:w-full max-md:max-w-none max-md:border max-md:border-border">
            {[
              { href: "/dashboard", label: "Home", Icon: LayoutDashboard },
              { href: "/dashboard/automations", label: "Flows", Icon: Bot },
              { href: "/dashboard/payments", label: "Pay", Icon: CreditCard },
              { href: "/dashboard/settings", label: "Settings", Icon: Settings },
            ].map(({ href, label, Icon }) => {
              const active = pathname === href || pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] ${
                    active ? "bg-indigo-500/15 text-foreground" : "text-slate-800 dark:text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
      <TourOverlay />
    </>
  );
}
