import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { securityHeaders } from "./lib/security";
import { isSubscriptionActive } from "./lib/subscription-access";
import { isPlatformRole, shouldRunWorkspaceChecks } from "./lib/global-role";

type SystemFlagSnapshot = {
  maintenance_mode: boolean;
  allow_signup: boolean;
  payments_enabled: boolean;
  automation_enabled: boolean;
  automation_replay_enabled: boolean;
  ai_enabled: boolean;
  support_enabled: boolean;
  admin_notifications_enabled: boolean;
  system_logs_enabled: boolean;
  impersonation_enabled: boolean;
  webhooks_ingest_enabled: boolean;
  exports_enabled: boolean;
};

const DEFAULT_FLAG_SNAPSHOT: SystemFlagSnapshot = {
  maintenance_mode: false,
  allow_signup: false,
  payments_enabled: false,
  automation_enabled: false,
  automation_replay_enabled: false,
  ai_enabled: false,
  support_enabled: false,
  admin_notifications_enabled: true,
  system_logs_enabled: true,
  impersonation_enabled: false,
  webhooks_ingest_enabled: true,
  exports_enabled: false,
};

let cachedFlags: { value: SystemFlagSnapshot; expiresAt: number } = {
  value: DEFAULT_FLAG_SNAPSHOT,
  expiresAt: 0,
};

async function getFlagSnapshot(req: NextRequest): Promise<SystemFlagSnapshot> {
  if (Date.now() < cachedFlags.expiresAt) return cachedFlags.value;

  const internalOrigin = process.env.INTERNAL_APP_URL?.trim();
  const requestOrigin = new URL(req.url).origin;
  const fallbackPort = process.env.PORT || "3000";
  const candidateOrigins = Array.from(
    new Set(
      [
        internalOrigin || null,
        process.env.NODE_ENV !== "production" ? `http://127.0.0.1:${fallbackPort}` : null,
        requestOrigin,
      ].filter((value): value is string => Boolean(value))
    )
  );

  try {
    const snapshotToken = process.env.SYSTEM_FLAGS_SNAPSHOT_TOKEN || process.env.NEXTAUTH_SECRET || "";
    for (const origin of candidateOrigins) {
      try {
        const url = new URL("/api/system-flags/snapshot", origin);
        const res = await fetch(url, {
          method: "GET",
          headers: { "x-system-flags-internal": snapshotToken },
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`flag snapshot failed (${res.status})`);
        }
        const payload = (await res.json()) as { flags?: Partial<SystemFlagSnapshot> };
        const next: SystemFlagSnapshot = {
          ...DEFAULT_FLAG_SNAPSHOT,
          ...(payload.flags || {}),
        };
        cachedFlags = {
          value: next,
          expiresAt: Date.now() + 15_000,
        };
        return next;
      } catch {
        continue;
      }
    }
    throw new Error("flag snapshot failed");
  } catch {
    if (cachedFlags.expiresAt > 0) {
      cachedFlags = {
        value: cachedFlags.value,
        expiresAt: Date.now() + 10_000,
      };
      return cachedFlags.value;
    }
    cachedFlags = {
      value: DEFAULT_FLAG_SNAPSHOT,
      expiresAt: Date.now() + 10_000,
    };
    return DEFAULT_FLAG_SNAPSHOT;
  }
}

async function handleProxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isLegacyPrelaunchPath =
    pathname !== "/admin/prelaunch" &&
    pathname.startsWith("/admin/prela") &&
    pathname.endsWith("nch");

  if (isLegacyPrelaunchPath) {
    return NextResponse.redirect(new URL("/admin/prelaunch", req.url));
  }

  const IMPERSONATION_COOKIE_NAME = "maboria_impersonation_session";
  const ADMIN_IMPERSONATION_ALLOWLIST = new Set([
    "/api/admin/impersonation/current",
    "/api/admin/impersonation/stop",
  ]);
  const PUBLIC_PATHS = new Set([
    "/",
    "/about",
    "/contact",
    "/pricing",
    "/privacy",
    "/subprocessors",
    "/dpa",
    "/terms",
    "/support",
    "/faq",
    "/docs",
    "/status",
    "/login",
    "/signup",
    "/create-account",
    "/forgot-password",
    "/reset-password",
    "/forgot",
    "/reset",
  ]);

  const PUBLIC_PREFIXES = [
    "/_next",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/images",
    "/brand",
    "/branding",
    "/payment-logos",
    "/announcements",
    "/public",
  ];

  const PUBLIC_API_PREFIXES = [
    "/api/auth",
    "/api/health",
    "/api/contact",
    "/api/system-flags/snapshot",
    "/api/support/webhooks/email",
    "/api/whatsapp/webhook",
    "/api/webhooks/whatsapp",
    "/api/webhooks/paystack",
    "/api/webhooks/flutterwave",
    "/api/payments/paystack/webhook",
    "/api/payments/flutterwave/webhook",
    "/api/whatsapp/webhook",
    "/api/invoice/pay",
    "/api/invoice/confirm",
    "/api/invoice/receipt",
    "/api/payments/callback",
    "/api/subscription/process-renewals",
    "/api/subscription/apply-pending-downgrades",
  ];

  const isPublicPath = PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isApi = pathname.startsWith("/api");
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  const signupBlockedPaths = ["/signup", "/create-account", "/api/auth/register", "/api/auth/signup"];
  const isSignupPath = signupBlockedPaths.some((path) => pathname.startsWith(path));

  if (isSignupPath) {
    const flags = await getFlagSnapshot(req);
    if (!flags.allow_signup) {
      if (isApi) {
        return NextResponse.json({ error: "Signup is disabled", code: "SYSTEM_FLAG_DISABLED" }, { status: 503 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  if (isPublicPath || (isApi && isPublicApi)) {
    const res = NextResponse.next();
    Object.entries(securityHeaders).forEach(([key, value]) => res.headers.set(key, value));
    return res;
  }

  const flags = await getFlagSnapshot(req);

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const actorGlobalRole = String((token as { role?: string } | null)?.role || "").toUpperCase();
  const actorIsPlatformUser = isPlatformRole(actorGlobalRole);
  if (flags.maintenance_mode && !actorIsPlatformUser && pathname !== "/status") {
    if (isApi) {
      return NextResponse.json(
        { error: "Maintenance mode is active", code: "SYSTEM_FLAG_DISABLED" },
        { status: 503 }
      );
    }
    return NextResponse.redirect(new URL("/status", req.url));
  }
  if (!token) {
    const loginUrl = new URL("/signup", req.url);
    if (!isApi) {
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!flags.ai_enabled && pathname.startsWith("/api/ai")) {
    return NextResponse.json({ error: "AI is disabled", code: "SYSTEM_FLAG_DISABLED" }, { status: 503 });
  }
  if (!flags.support_enabled && (pathname.startsWith("/api/support") || pathname.startsWith("/api/admin/support"))) {
    return NextResponse.json({ error: "Support is disabled", code: "SYSTEM_FLAG_DISABLED" }, { status: 503 });
  }
  if (!flags.admin_notifications_enabled && (pathname.startsWith("/api/admin/notifications") || pathname.startsWith("/admin/notifications"))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Admin notifications are disabled", code: "SYSTEM_FLAG_DISABLED" }, { status: 503 });
    }
    return NextResponse.redirect(new URL("/admin", req.url));
  }
  if (!flags.automation_enabled) {
    if (
      pathname.startsWith("/api/automation/process-due") ||
      pathname.startsWith("/api/admin/automation/process-due") ||
      pathname.startsWith("/api/automation/run") ||
      pathname.startsWith("/api/automation/schedule")
    ) {
      return NextResponse.json({ error: "Automation engine is disabled", code: "SYSTEM_FLAG_DISABLED" }, { status: 503 });
    }
  }
  if (!flags.automation_replay_enabled) {
    if (
      pathname.startsWith("/api/admin/automation/replay") ||
      pathname.startsWith("/api/admin/automation/retry-safe") ||
      pathname.startsWith("/api/automation/retry-safe") ||
      pathname.includes("/api/admin/automation/errors/") && pathname.endsWith("/replay")
    ) {
      return NextResponse.json({ error: "Automation replay is disabled", code: "SYSTEM_FLAG_DISABLED" }, { status: 503 });
    }
  }
  if (!flags.payments_enabled) {
    const paymentWritePath =
      pathname.startsWith("/api/checkout") ||
      pathname.startsWith("/api/checkout/session") ||
      pathname === "/api/payments" ||
      pathname.startsWith("/api/payments/paystack") ||
      pathname.startsWith("/api/payments/flutterwave") ||
      pathname.startsWith("/api/payments/stripe") ||
      pathname.startsWith("/api/payments/verify") ||
      (pathname.startsWith("/api/subscription") && req.method !== "GET");
    if (paymentWritePath) {
      return NextResponse.json({ error: "Payments are disabled", code: "SYSTEM_FLAG_DISABLED" }, { status: 503 });
    }
  }
  if (!flags.impersonation_enabled) {
    if (pathname.startsWith("/api/admin/impersonation/start") || pathname.startsWith("/api/admin/users/impersonate")) {
      return NextResponse.json({ error: "Impersonation is disabled", code: "SYSTEM_FLAG_DISABLED" }, { status: 503 });
    }
  }
  if (!flags.webhooks_ingest_enabled) {
    if (pathname.startsWith("/api/webhooks/ingest") || pathname.startsWith("/api/inbox/unified/webhooks/")) {
      return NextResponse.json({ error: "Webhooks ingest is disabled", code: "SYSTEM_FLAG_DISABLED" }, { status: 503 });
    }
  }
  if (!flags.exports_enabled) {
    if (
      pathname.startsWith("/api/admin/revenue/export") ||
      pathname.startsWith("/api/analytics/usage/export") ||
      pathname.startsWith("/api/analytics/usage/export-history")
    ) {
      return NextResponse.json({ error: "Exports are disabled", code: "SYSTEM_FLAG_DISABLED" }, { status: 503 });
    }
  }
  if (!flags.system_logs_enabled || !flags.exports_enabled) {
    if (pathname.startsWith("/api/admin/logs/export")) {
      return NextResponse.json({ error: "System logs export is disabled", code: "SYSTEM_FLAG_DISABLED" }, { status: 503 });
    }
  }

  let isImpersonating = false;
  const impersonationCookie = req.cookies.get(IMPERSONATION_COOKIE_NAME)?.value || "";
  const shouldResolveImpersonation =
    actorIsPlatformUser &&
    Boolean(impersonationCookie) &&
    !pathname.startsWith("/api/admin/impersonation/current");

  if (shouldResolveImpersonation) {
    try {
      const checkUrl = new URL("/api/admin/impersonation/current", req.url);
      const checkResponse = await fetch(checkUrl, {
        headers: { cookie: req.headers.get("cookie") ?? "" },
      });
      const checkPayload = await checkResponse.json().catch(() => ({}));
      isImpersonating = Boolean(checkResponse.ok && checkPayload?.active);
    } catch {
      isImpersonating = false;
    }
  }

  const effectiveGlobalRole = isImpersonating ? "USER" : actorGlobalRole;
  const isPlatformUser = isPlatformRole(effectiveGlobalRole);
  const mustRunWorkspaceChecks = shouldRunWorkspaceChecks(effectiveGlobalRole);
  const isAdminPath = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");

  if (isAdminPath && !actorIsPlatformUser) {
    return new Response("Forbidden", { status: 403 });
  }

  if (isAdminPath && isImpersonating && !ADMIN_IMPERSONATION_ALLOWLIST.has(pathname)) {
    if (isApi) {
      return NextResponse.json(
        {
          error: "Admin control-plane is blocked while impersonating.",
          code: "FORBIDDEN_IMPERSONATION_MODE",
        },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (isPlatformUser) {
    const res = NextResponse.next();
    Object.entries(securityHeaders).forEach(([key, value]) => res.headers.set(key, value));
    return res;
  }

  const allowWhenInactive = [
    "/billing/locked",
    "/billing/checkout",
    "/billing/retry",
    "/checkout",
    "/checkout/return",
    "/logout",
  ];
  const allowInactiveApi = [
    "/api/checkout",
    "/api/subscription",
    "/api/payments/callback",
    "/api/payments/verify",
    "/api/payments/paystack",
    "/api/payments/flutterwave",
  ];
  if (allowWhenInactive.some((p) => pathname.startsWith(p)) || (isApi && allowInactiveApi.some((p) => pathname.startsWith(p)))) {
    const res = NextResponse.next();
    Object.entries(securityHeaders).forEach(([key, value]) => res.headers.set(key, value));
    return res;
  }

  try {
    const checkUrl = new URL("/api/subscription", req.url);
    checkUrl.searchParams.set("scope", "status_check");
    const res = await fetch(checkUrl, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
    });
    const data = await res.json().catch(() => ({}));
    let status = "";
    if (Array.isArray(data)) {
      const active = data.find((s) => s?.status === "ACTIVE");
      status = (active?.status || data[0]?.status || "").toUpperCase();
    } else {
      status = (data?.status || data?.subscription?.status || "").toUpperCase();
    }
    const accessStatus = String(data?.accessStatus || "").toUpperCase();
    if (mustRunWorkspaceChecks && accessStatus && accessStatus !== "ACTIVE") {
      if (isApi) {
        return NextResponse.json({ error: "Organization suspended" }, { status: 423 });
      }
      return NextResponse.redirect(new URL("/billing/locked", req.url));
    }

    if (res.status === 404 || String(data?.error || "").toLowerCase().includes("organization not found")) {
      if (isApi) {
        return NextResponse.json({ error: "Organization onboarding required" }, { status: 409 });
      }
      return NextResponse.redirect(new URL("/dashboard/onboarding", req.url));
    }

    if (mustRunWorkspaceChecks && !isSubscriptionActive(status)) {
      if (isApi) {
        return NextResponse.json({ error: "Subscription inactive" }, { status: 402 });
      }
      return NextResponse.redirect(new URL("/billing/locked", req.url));
    }
  } catch {
    if (!isApi) {
      return NextResponse.redirect(new URL("/billing/locked", req.url));
    }
  }

  const res = NextResponse.next();
  Object.entries(securityHeaders).forEach(([key, value]) => res.headers.set(key, value));
  return res;
}

export async function proxy(req: NextRequest) {
  return handleProxy(req);
}

// Backwards compatibility if Next.js expects middleware export.
export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)"],
};
