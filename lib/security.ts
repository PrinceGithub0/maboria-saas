import { NextResponse } from "next/server";

export const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
};

export function withSecurityHeaders(response: NextResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}
