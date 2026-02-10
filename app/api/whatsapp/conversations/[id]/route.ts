import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { resolveBusinessIdForUser } from "@/lib/whatsapp";

export const GET = withErrorHandling(async (_req: Request, ctx: { params: { id: string } }) => {
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
  if (!businessId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: ctx.params.id, businessId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
      invoice: {
        select: { id: true, invoiceNumber: true, total: true, currency: true, status: true, generatedAt: true },
      },
      payment: {
        select: { id: true, amount: true, currency: true, provider: true, status: true, createdAt: true },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(conversation);
});

export const PATCH = withErrorHandling(async (req: Request, ctx: { params: { id: string } }) => {
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
  if (!businessId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const allowed = ["status", "assignedToId", "customerName", "tags", "internalNotes"];
  const update: Record<string, any> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: ctx.params.id, businessId },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: update,
  });

  return NextResponse.json(updated);
});
