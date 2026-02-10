import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { resolveBusinessIdForUser } from "@/lib/whatsapp";

const settingsSchema = z.object({
  autoCloseEnabled: z.boolean().optional(),
  autoCloseAfterHours: z.number().min(1).max(720).optional(),
});

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

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { autoCloseEnabled: true, autoCloseAfterHours: true },
  });

  return NextResponse.json(business ?? { autoCloseEnabled: true, autoCloseAfterHours: 48 });
});

export const PUT = withErrorHandling(async (req: Request) => {
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

  const body = await req.json().catch(() => ({}));
  const parsed = settingsSchema.parse(body);

  const updated = await prisma.business.update({
    where: { id: businessId },
    data: parsed,
    select: { autoCloseEnabled: true, autoCloseAfterHours: true },
  });

  return NextResponse.json(updated);
});
