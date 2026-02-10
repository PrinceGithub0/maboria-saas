import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { securityHeaders } from "./lib/security";
import { isSubscriptionActive } from "./lib/subscription-access";

async function handleProxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const PUBLIC_PATHS = new Set([
    "/",
    "/about",
    "/contact",
    "/pricing",
    "/privacy",
    "/terms",
    "/support",
    "/faq",
    "/docs",
    "/status",
    "/login",
    "/signup",
  ]);

  const PUBLIC_PREFIXES = [
    "/_next",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/images",
    "/branding",
    "/payment-logos",
    "/announcements",
    "/public",
  ];

  const PUBLIC_API_PREFIXES = [
    "/api/auth",
    "/api/health",
    "/api/contact",
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
    "/api/invoice/",
    "/api/payments/callback",
  ];

  const isPublicPath = PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isApi = pathname.startsWith("/api");
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));

  if (isPublicPath || (isApi && isPublicApi)) {
    const res = NextResponse.next();
    Object.entries(securityHeaders).forEach(([key, value]) => res.headers.set(key, value));
    return res;
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const loginUrl = new URL("/signup", req.url);
    if (!isApi) {
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if ((pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) && (token as { role?: string }).role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
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
    if (!isSubscriptionActive(status)) {
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
