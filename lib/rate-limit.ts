type Hit = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Hit>();

export function assertRateLimit(identifier: string, limit = 50, windowMs = 60_000) {
  const key = `${identifier}:${Math.floor(Date.now() / windowMs)}`;
  const hit = buckets.get(key) ?? { count: 0, resetAt: Date.now() + windowMs };

  if (hit.count >= limit) {
    const retryAfter = Math.max(0, Math.ceil((hit.resetAt - Date.now()) / 1000));
    const error = new Error("Too many requests");
    (error as any).status = 429;
    (error as any).retryAfter = retryAfter;
    throw error;
  }

  buckets.set(key, { count: hit.count + 1, resetAt: hit.resetAt });
  if (process.env.RATE_LOG === "true") {
    import("./prisma").then(({ prisma }) =>
      prisma.rateLimitLog.create({
        data: { key: identifier, count: hit.count + 1, window: `${windowMs}ms` },
      }).catch(async (error) => {
        const { log } = await import("./logger");
        log("warn", "Rate limit log write failed", { identifier, error: error?.message });
      })
    );
  }
}
