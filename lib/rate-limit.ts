type Hit = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Hit>();
const RATE_LIMIT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function buildRateLimitError(retryAfter: number) {
  const error = new Error("Too many requests");
  (error as Error & { status?: number; retryAfter?: number }).status = 429;
  (error as Error & { status?: number; retryAfter?: number }).retryAfter = retryAfter;
  return error;
}

export function assertRateLimit(identifier: string, limit = 50, windowMs = 60_000) {
  const key = `${identifier}:${Math.floor(Date.now() / windowMs)}`;
  const hit = buckets.get(key) ?? { count: 0, resetAt: Date.now() + windowMs };

  if (hit.count >= limit) {
    const retryAfter = Math.max(0, Math.ceil((hit.resetAt - Date.now()) / 1000));
    throw buildRateLimitError(retryAfter);
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

export async function assertRateLimitAsync(identifier: string, limit = 50, windowMs = 60_000) {
  const persistentMode =
    process.env.RATE_LIMIT_PERSISTENT === "1" || process.env.NODE_ENV === "production";

  if (!persistentMode) {
    assertRateLimit(identifier, limit, windowMs);
    return;
  }

  const { prisma } = await import("./prisma");
  const now = Date.now();
  const windowStart = new Date(now - windowMs);
  const windowLabel = `${windowMs}ms`;

  const [recentCount, oldestHit] = await prisma.$transaction([
    prisma.rateLimitLog.count({
      where: {
        key: identifier,
        createdAt: { gte: windowStart },
      },
    }),
    prisma.rateLimitLog.findFirst({
      where: {
        key: identifier,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  if (recentCount >= limit) {
    const retryAfter = oldestHit
      ? Math.max(
          1,
          Math.ceil((oldestHit.createdAt.getTime() + windowMs - now) / 1000)
        )
      : Math.max(1, Math.ceil(windowMs / 1000));
    throw buildRateLimitError(retryAfter);
  }

  await prisma.rateLimitLog.create({
    data: {
      key: identifier,
      count: recentCount + 1,
      window: windowLabel,
    },
  });

  if (Math.random() < 0.02) {
    prisma.rateLimitLog
      .deleteMany({
        where: {
          createdAt: {
            lt: new Date(now - RATE_LIMIT_RETENTION_MS),
          },
        },
      })
      .catch(async (error) => {
        const { log } = await import("./logger");
        log("warn", "Rate limit cleanup failed", { identifier, error: error?.message });
      });
  }
}
