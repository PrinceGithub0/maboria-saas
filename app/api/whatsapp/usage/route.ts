import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement, getUserPlan, getUsageCountThisMonth, planLimits, UserPlan } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { resolveBusinessIdForUser } from "@/lib/whatsapp";

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

  const plan = await getUserPlan(session.user.id);
  const businessId = await resolveBusinessIdForUser(session.user.id);
  if (!businessId) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const [aiUsed, whatsappUsed, savedReplies] = await Promise.all([
    getUsageCountThisMonth(session.user.id, "aiRequests"),
    getUsageCountThisMonth(session.user.id, "whatsappMessages"),
    prisma.cannedReply.count({ where: { businessId } }),
  ]);

  return NextResponse.json({
    plan,
    ai: {
      used: aiUsed,
      limit: planLimits[plan].aiRequests ?? null,
    },
    whatsapp: {
      used: whatsappUsed,
      limit: planLimits[plan].whatsappMessages ?? null,
    },
    savedReplies: {
      used: savedReplies,
      limit: cannedReplyLimits[plan],
    },
  });
});
