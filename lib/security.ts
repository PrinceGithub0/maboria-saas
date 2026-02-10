import { NextResponse } from "next/server";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "";
const isLocalhost = appUrl.includes("localhost") || appUrl.includes("127.0.0.1");
const isDev = process.env.NODE_ENV !== "production" || isLocalhost;
const allowInlineScripts = isDev || process.env.NEXT_PUBLIC_ALLOW_INLINE === "1";

const contentSecurityPolicy = [
  "default-src 'self'",
  allowInlineScripts
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:"
    : "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  isDev
    ? "connect-src 'self' http: https: ws: wss: blob:"
    : "connect-src 'self' https:",
  "frame-ancestors 'none'",
].join("; ");

export const securityHeaders = {
  "Content-Security-Policy": contentSecurityPolicy,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
};

export function withSecurityHeaders(response: NextResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}
