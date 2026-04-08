import { NextResponse } from "next/server";
import { ZodError } from "zod";
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
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: "Invalid request payload.",
            code: "VALIDATION_ERROR",
            issues: error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            })),
          },
          { status: 422 }
        );
      }

      const status = (error as any).status || 500;
      const code = (error as any).code;
      const isServerError = Number(status) >= 500;
      return NextResponse.json(
        {
          error: isServerError
            ? "Something went wrong. Please try again later."
            : error.message || "Request failed",
          ...(code && !isServerError ? { code: String(code) } : {}),
        },
        { status }
      );
    }
  };
}
