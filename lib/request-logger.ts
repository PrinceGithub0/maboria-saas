import { NextResponse } from "next/server";
import { log } from "./logger";

export function withRequestLogging(handler: (req: Request, ctx?: any) => Promise<NextResponse>) {
  return async (req: Request, ctx?: any) => {
    const start = Date.now();
    const res = await handler(req, ctx);
    const duration = Date.now() - start;
    log("info", "api_request", {
      path: new URL(req.url).pathname,
      status: res.status,
      durationMs: duration,
      method: req.method,
    });
    return res;
  };
}
