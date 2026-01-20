import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { securityHeaders } from "./lib/security";

async function handleProxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin");

  if (!isProtected) {
    const res = NextResponse.next();
    Object.entries(securityHeaders).forEach(([key, value]) => res.headers.set(key, value));
    return res;
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (pathname.startsWith("/admin") && (token as { role?: string }).role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  const res = NextResponse.next();
  Object.entries(securityHeaders).forEach(([key, value]) => res.headers.set(key, value));
  return res;
}

export async function proxy(req: NextRequest) {
  return handleProxy(req);
}

// Backwards compatibility if Next.js expects middleware export.
export async function middleware(req: NextRequest) {
  return handleProxy(req);
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/admin/:path*"],
};
