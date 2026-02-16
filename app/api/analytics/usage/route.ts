import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceScope } from "@/lib/entitlements";
import { PLAN_LIMITS, normalizePlanLimitKey, UNLIMITED } from "@/lib/planLimits";

const formatDateKey = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const buildDateKeys = (startDate: Date, endDate: Date, timeZone: string) => {
  const keys: string[] = [];
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);
  while (cursor <= end) {
    keys.push(formatDateKey(cursor, timeZone));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tz = searchParams.get("tz") || "UTC";
  const requestedRange = Number(searchParams.get("range") || "30");
  const rangeDaysRequested = Number.isFinite(requestedRange) && requestedRange > 0 ? requestedRange : 30;
  const usageScope = await getWorkspaceScope(session.user.id);
  const workspaceId = usageScope.businessId ?? session.user.id;
  const scopeUserIds = usageScope.userIds.length ? usageScope.userIds : [session.user.id];

  const now = new Date();
  let startUtc = new Date(now);
  startUtc.setUTCHours(0, 0, 0, 0);
  startUtc.setUTCDate(startUtc.getUTCDate() - (rangeDaysRequested - 1));
  let endUtc = new Date(now);
  endUtc.setUTCHours(23, 59, 59, 999);

  const activeSub = await prisma.subscription.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      plan: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  });
  const subscriptionStart = activeSub?.currentPeriodStart ?? null;
  if (subscriptionStart) {
    const anchor = new Date(subscriptionStart);
    anchor.setUTCHours(0, 0, 0, 0);
    if (anchor > startUtc) {
      startUtc = anchor;
    }
    if (anchor > endUtc) {
      endUtc = new Date(anchor);
      endUtc.setUTCHours(23, 59, 59, 999);
    }
  }

  let dateKeys = buildDateKeys(startUtc, endUtc, tz);
  const todayKey = formatDateKey(now, tz);
  if (!dateKeys.includes(todayKey)) {
    dateKeys = [...dateKeys, todayKey];
  }
  const rows = dateKeys.map((date) => ({
    date,
    invoices: 0,
    automationRuns: 0,
    aiRequests: 0,
    aiTokens: 0,
    whatsappMessages: 0,
  }));
  const indexByDate = new Map(dateKeys.map((date, idx) => [date, idx]));

  const events = await prisma.analyticsEvent.findMany({
    where: {
      createdAt: { gte: startUtc, lte: endUtc },
      OR: [{ workspaceId }, { userId: { in: scopeUserIds } }],
    },
    orderBy: { createdAt: "asc" },
  });

  for (const event of events) {
    const key = formatDateKey(event.createdAt, tz);
    const idx = indexByDate.get(key);
    if (idx === undefined) continue;
    const count = Number(event.count || 0);
    const tokens = Number(event.tokenCount || 0);
    const resolvedType =
      event.type === "WHATSAPP_MESSAGE"
        ? "WHATSAPP_MESSAGE_SENT"
        : event.type ??
          (event.category === "INVOICE_CREATED"
            ? "INVOICE_SENT"
            : event.category === "AUTOMATION_SUCCESS"
              ? "AUTOMATION_RUN"
              : event.category === "AI_REQUEST"
                ? "AI_REQUEST"
                : undefined);
    switch (resolvedType) {
      case "INVOICE_SENT":
        rows[idx].invoices += count || 1;
        break;
      case "AUTOMATION_RUN":
        rows[idx].automationRuns += count || 1;
        break;
      case "AI_REQUEST": {
        const increment = count || 1;
        rows[idx].aiRequests += increment;
        break;
      }
      case "AI_TOKENS":
        rows[idx].aiTokens += tokens || count || 0;
        break;
      case "WHATSAPP_MESSAGE_SENT":
        rows[idx].whatsappMessages += count || 1;
        break;
      default:
        break;
    }
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.invoices += Number(row.invoices) || 0;
      acc.automationRuns += Number(row.automationRuns) || 0;
      acc.aiRequests += Number(row.aiRequests) || 0;
      acc.aiTokens += Number(row.aiTokens) || 0;
      acc.whatsappMessages += Number(row.whatsappMessages) || 0;
      return acc;
    },
    { invoices: 0, automationRuns: 0, aiRequests: 0, aiTokens: 0, whatsappMessages: 0 }
  );
  const rangeDays = Math.max(1, rows.length);
  const averages = {
    invoices: Math.round(totals.invoices / rangeDays),
    automationRuns: Math.round(totals.automationRuns / rangeDays),
    aiRequests: Math.round(totals.aiRequests / rangeDays),
    aiTokens: Math.round(totals.aiTokens / rangeDays),
    whatsappMessages: Math.round(totals.whatsappMessages / rangeDays),
  };
  const peak = {
    invoices: rows.reduce((best, row) => (row.invoices > best.value ? { date: row.date, value: row.invoices } : best), { date: "--", value: 0 }),
    automationRuns: rows.reduce((best, row) => (row.automationRuns > best.value ? { date: row.date, value: row.automationRuns } : best), { date: "--", value: 0 }),
    aiRequests: rows.reduce((best, row) => (row.aiRequests > best.value ? { date: row.date, value: row.aiRequests } : best), { date: "--", value: 0 }),
    aiTokens: rows.reduce((best, row) => (row.aiTokens > best.value ? { date: row.date, value: row.aiTokens } : best), { date: "--", value: 0 }),
    whatsappMessages: rows.reduce((best, row) => (row.whatsappMessages > best.value ? { date: row.date, value: row.whatsappMessages } : best), { date: "--", value: 0 }),
  };

  const cycleStart = activeSub?.currentPeriodStart
    ? new Date(activeSub.currentPeriodStart)
    : usageScope.start;
  const cycleEnd = activeSub?.currentPeriodEnd
    ? new Date(activeSub.currentPeriodEnd)
    : usageScope.resetAt ?? endUtc;
  const cycleWindowEnd = cycleEnd < endUtc ? cycleEnd : endUtc;
  const monthEvents = await prisma.analyticsEvent.findMany({
    where: {
      createdAt: { gte: cycleStart, lte: cycleWindowEnd },
      OR: [{ workspaceId }, { userId: { in: scopeUserIds } }],
    },
  });
  const usedThisMonth = {
    invoices: 0,
    automationRuns: 0,
    aiRequests: 0,
    aiTokens: 0,
    whatsappMessages: 0,
  };
  for (const event of monthEvents) {
    const resolvedType =
      event.type === "WHATSAPP_MESSAGE"
        ? "WHATSAPP_MESSAGE_SENT"
        : event.type ??
          (event.category === "INVOICE_CREATED"
            ? "INVOICE_SENT"
            : event.category === "AUTOMATION_SUCCESS"
              ? "AUTOMATION_RUN"
              : event.category === "AI_REQUEST"
                ? "AI_REQUEST"
                : undefined);
    const count = Number(event.count || 0);
    const tokens = Number(event.tokenCount || 0);
    switch (resolvedType) {
      case "INVOICE_SENT":
        usedThisMonth.invoices += count || 1;
        break;
      case "AUTOMATION_RUN":
        usedThisMonth.automationRuns += count || 1;
        break;
      case "AI_REQUEST":
        usedThisMonth.aiRequests += count || 1;
        break;
      case "AI_TOKENS":
        usedThisMonth.aiTokens += tokens || count || 0;
        break;
      case "WHATSAPP_MESSAGE_SENT":
        usedThisMonth.whatsappMessages += count || 1;
        break;
      default:
        break;
    }
  }

  const planKey = normalizePlanLimitKey(activeSub?.plan || null);
  const limits = planKey
    ? PLAN_LIMITS[planKey]
    : {
        invoices: 0,
        whatsapp: 0,
        aiRequests: 0,
        automations: 0,
      };
  const limitResponse = {
    invoices: buildLimit(usedThisMonth.invoices, limits.invoices),
    automationRuns: buildLimit(usedThisMonth.automationRuns, limits.automations),
    aiRequests: buildLimit(usedThisMonth.aiRequests, limits.aiRequests),
    aiTokens: buildLimit(usedThisMonth.aiTokens, limits.aiRequests),
    whatsappMessages: buildLimit(usedThisMonth.whatsappMessages, limits.whatsapp),
  };

  const cycleStartKey = formatDateKey(cycleStart, tz);
  const cycleEndKey = formatDateKey(cycleEnd, tz);
  const cycleDates = rows.filter((row) => row.date >= cycleStartKey && row.date <= cycleEndKey);
  const cycleSums = cycleDates.reduce(
    (acc, row) => {
      acc.invoices += Number(row.invoices) || 0;
      acc.automationRuns += Number(row.automationRuns) || 0;
      acc.aiRequests += Number(row.aiRequests) || 0;
      acc.aiTokens += Number(row.aiTokens) || 0;
      acc.whatsappMessages += Number(row.whatsappMessages) || 0;
      return acc;
    },
    { invoices: 0, automationRuns: 0, aiRequests: 0, aiTokens: 0, whatsappMessages: 0 }
  );
  const mismatch =
    cycleSums.invoices !== usedThisMonth.invoices ||
    cycleSums.automationRuns !== usedThisMonth.automationRuns ||
    cycleSums.aiRequests !== usedThisMonth.aiRequests ||
    cycleSums.aiTokens !== usedThisMonth.aiTokens ||
    cycleSums.whatsappMessages !== usedThisMonth.whatsappMessages;
  if (mismatch) {
    console.warn("analytics_cycle_mismatch", {
      cycleStart: cycleStart.toISOString(),
      cycleEnd: cycleEnd.toISOString(),
      cycleSums,
      usedThisMonth,
    });
  }

  return NextResponse.json(
    {
      range: {
        startDate: dateKeys[0],
        endDate: dateKeys[dateKeys.length - 1],
        rangeDays,
        tz,
        lastUpdated: now.toISOString(),
        cycleStart: cycleStart.toISOString(),
        cycleEnd: cycleEnd.toISOString(),
      },
      rows,
      totals,
      averages,
      peak,
      usedThisCycle: usedThisMonth,
      limits: limitResponse,
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function buildLimit(used: number, limit?: number | null) {
  if (limit == null || limit === UNLIMITED) {
    return { used, limit: UNLIMITED, remaining: null, isExceeded: false };
  }
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, isExceeded: used >= limit };
}
