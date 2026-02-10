import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement, getUserPlan, UserPlan } from "@/lib/entitlements";
import { resolveBusinessIdForUser } from "@/lib/whatsapp";

const replySchema = z.object({
  title: z.string().min(2).max(80),
  content: z.string().min(2).max(2000),
});

const cannedReplyLimits: Record<UserPlan, number | null> = {
  free: 0,
  starter: 3,
  pro: null,
  growth: null,
  business: null,
  enterprise: null,
};

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "whatsapp",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const businessId = await resolveBusinessIdForUser(session.user.id);
  if (!businessId) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const replies = await prisma.cannedReply.findMany({
    where: { businessId },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(replies);
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "whatsapp",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = replySchema.parse(body);
  const plan = await getUserPlan(session.user.id);
  const businessId = await resolveBusinessIdForUser(session.user.id);
  if (!businessId) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const limit = cannedReplyLimits[plan];
  if (limit !== null) {
    const count = await prisma.cannedReply.count({ where: { businessId } });
    if (count >= limit) {
      return NextResponse.json(
        {
          error: "Saved replies limit reached",
          type: "limit_reached",
          limit,
          used: count,
        },
        { status: 403 }
      );
    }
  }
  const reply = await prisma.cannedReply.create({
    data: {
      businessId,
      userId: session.user.id,
      title: parsed.title,
      content: parsed.content,
    },
  });
  return NextResponse.json(reply, { status: 201 });
});
