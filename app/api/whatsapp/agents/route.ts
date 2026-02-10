import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { resolveBusinessIdForUser } from "@/lib/whatsapp";

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
  if (!businessId) return NextResponse.json([]);

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  });

  const members = await prisma.businessMember.findMany({
    where: { businessId },
    select: { user: { select: { id: true, name: true, email: true } } },
  });

  const agentMap = new Map<string, { id: string; name: string; email: string }>();
  for (const member of members) {
    if (member.user) agentMap.set(member.user.id, member.user);
  }

  if (business?.ownerId && !agentMap.has(business.ownerId)) {
    const owner = await prisma.user.findUnique({
      where: { id: business.ownerId },
      select: { id: true, name: true, email: true },
    });
    if (owner) agentMap.set(owner.id, owner);
  }

  return NextResponse.json(Array.from(agentMap.values()));
});
