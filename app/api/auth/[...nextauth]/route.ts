import NextAuth from "next-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(req: Request, ctx: any) {
  try {
    const { authOptions } = await import("@/lib/auth");
    const baseHandler = NextAuth(authOptions);
    return await baseHandler(req, ctx);
  } catch (error: any) {
    console.error("NEXTAUTH_INIT_ERROR", error);
    return NextResponse.json(
      { error: "Auth handler failed", detail: error?.message },
      { status: 500 }
    );
  }
}

export { handler as GET, handler as POST };
