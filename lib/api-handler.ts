import { NextResponse } from "next/server";
import { log } from "./logger";

type Handler = (req: Request, ctx?: any) => Promise<NextResponse>;

export function withErrorHandling(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error: any) {
      log("error", "API error", { message: error.message, stack: error.stack });
      const status = (error as any).status || 500;
      return NextResponse.json({ error: error.message || "Server error" }, { status });
    }
  };
}
