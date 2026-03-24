import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireOrgPermission } from "@/lib/org-auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { ensureCurrentSubscriptionForOrg } from "@/lib/subscription-downgrade";
import { resolveSubscriptionPaymentScope } from "@/lib/payments/subscription-payment-scope";
import { withRequestLogging } from "@/lib/request-logger";

const SUBSCRIPTION_PAYMENTS_PAGE_SIZE = 8;
const SUBSCRIPTION_PAYMENTS_MAX_PAGE_SIZE = 50;

function normalizeHistoryLimit(value: string | null) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return SUBSCRIPTION_PAYMENTS_PAGE_SIZE;
  return Math.max(1, Math.min(parsed, SUBSCRIPTION_PAYMENTS_MAX_PAGE_SIZE));
}

function encodeHistoryCursor(input: { createdAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({ createdAt: input.createdAt.toISOString(), id: input.id }), "utf8").toString("base64url");
}

function decodeHistoryCursor(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      createdAt?: string;
      id?: string;
    };
    if (!parsed?.createdAt || !parsed?.id) return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export const GET = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireOrgPermission(session.user.id, {
    permission: "subscription:manage",
    requireActiveSubscription: false,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  const url = new URL(req.url);
  const limit = normalizeHistoryLimit(url.searchParams.get("limit"));
  const cursor = decodeHistoryCursor(url.searchParams.get("cursor"));
  const [orgSub, ownedBusinessCount] = await Promise.all([
    prisma.orgSubscription.findUnique({
      where: { orgId: access.context.orgId },
      select: {
        providerSubscriptionId: true,
        status: true,
      },
    }),
    prisma.business.count({
      where: { ownerId: access.context.ownerUserId },
    }),
  ]);

  const bridgedSubscription =
    ownedBusinessCount > 1 &&
    !orgSub?.providerSubscriptionId &&
    ["ACTIVE", "PAST_DUE", "TRIALING"].includes(String(orgSub?.status || "").toUpperCase())
      ? await ensureCurrentSubscriptionForOrg(access.context.ownerUserId, access.context.orgId)
      : null;

  const paymentScope = resolveSubscriptionPaymentScope({
    ownedBusinessCount,
    linkedSubscriptionId: orgSub?.providerSubscriptionId,
    bridgedSubscriptionId: bridgedSubscription?.id,
    orgSubscriptionStatus: orgSub?.status,
  });

  if (paymentScope.mode === "empty") {
    return NextResponse.json({
      items: [],
      pagination: {
        pageSize: limit,
        hasMore: false,
        nextCursor: null,
      },
    });
  }

  const paymentTypeWhere = [
    { metadata: { path: ["type"], equals: "subscription_payment" } },
    { metadata: { path: ["type"], equals: "checkout_session" } },
    { metadata: { path: ["receiptUrl"], string_contains: "/receipts/subscriptions/" } },
  ];
  const scopedPaymentWhere =
    paymentScope.mode === "scoped_subscription" && paymentScope.subscriptionId
      ? {
          AND: [
            { OR: paymentTypeWhere },
            { metadata: { path: ["subscriptionId"], equals: paymentScope.subscriptionId } },
          ],
        }
      : {
          OR: paymentTypeWhere,
        };
  const cursorWhere = cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : null;

  const rowsWhere = cursorWhere
    ? {
        userId: access.context.ownerUserId,
        AND: [scopedPaymentWhere, cursorWhere],
      }
    : {
        userId: access.context.ownerUserId,
        ...scopedPaymentWhere,
      };

  const rows = await prisma.payment.findMany({
    where: rowsWhere,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      amount: true,
      currency: true,
      provider: true,
      status: true,
      createdAt: true,
      reference: true,
    },
  });

  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? encodeHistoryCursor({
        createdAt: visibleRows[visibleRows.length - 1]!.createdAt,
        id: visibleRows[visibleRows.length - 1]!.id,
      })
    : null;

  return NextResponse.json(
    {
      items: visibleRows.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
      })),
      pagination: {
        pageSize: limit,
        hasMore,
        nextCursor,
      },
    }
  );
}));
