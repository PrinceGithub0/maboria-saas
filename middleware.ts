import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { securityHeaders } from "./lib/security";

export async function middleware(req: Request) {
  // @ts-ignore
  const { pathname } = (req as any).nextUrl as { pathname: string };
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin");

  if (!isProtected) {
    const res = NextResponse.next();
    Object.entries(securityHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  const token = await getToken({ req: req as any, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.redirect(new URL("/login", (req as any).url));
  }

  if (pathname.startsWith("/admin") && (token as any).role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  const res = NextResponse.next();
  Object.entries(securityHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/admin/:path*"],
};
