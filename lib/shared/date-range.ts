export type GlobalRangeKey = "today" | "last7" | "last30" | "custom";

export type GlobalDateRange = {
  key: GlobalRangeKey;
  from: string;
  to: string;
  label: string;
};

function toYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function parseYmd(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function resolveGlobalDateRange(input?: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}): GlobalDateRange {
  const now = new Date();
  const requested = String(input?.range || "last7").toLowerCase();

  if (requested === "today") {
    const day = toYmd(now);
    return { key: "today", from: day, to: day, label: "Today" };
  }

  if (requested === "last30") {
    const start = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
    return { key: "last30", from: toYmd(start), to: toYmd(now), label: "Last 30 Days" };
  }

  if (requested === "custom") {
    const from = parseYmd(input?.from);
    const to = parseYmd(input?.to);
    if (from && to && from.getTime() <= to.getTime()) {
      return { key: "custom", from: toYmd(from), to: toYmd(to), label: "Custom" };
    }
  }

  const start = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  return { key: "last7", from: toYmd(start), to: toYmd(now), label: "Last 7 Days" };
}

export function rangeToQuery(range: GlobalDateRange, extras?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  params.set("range", range.key);
  if (range.key === "custom") {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  Object.entries(extras || {}).forEach(([key, value]) => {
    if (value == null || value === "") return;
    params.set(key, value);
  });
  return params;
}

