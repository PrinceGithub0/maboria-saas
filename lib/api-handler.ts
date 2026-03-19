import { NextResponse } from "next/server";
import { log } from "./logger";

type Handler = (req: Request, ctx?: any) => Promise<NextResponse>;

export function withErrorHandling(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      const normalizedCtx =
        ctx && ctx.params && typeof ctx.params?.then === "function"
          ? { ...ctx, params: await ctx.params }
          : ctx;
      return await handler(req, normalizedCtx);
    } catch (error: any) {
      log("error", "API error", { message: error.message, stack: error.stack });
      const status = (error as any).status || 500;
      const code = (error as any).code;
      return NextResponse.json(
        {
          error: error.message || "Server error",
          ...(code ? { code: String(code) } : {}),
        },
        { status }
      );
    }
  };
}
