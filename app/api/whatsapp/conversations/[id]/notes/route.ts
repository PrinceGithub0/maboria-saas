import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { enforceEntitlement } from "@/lib/entitlements";
import { resolveBusinessIdForUser } from "@/lib/whatsapp";

const noteSchema = z.object({
  content: z.string().min(2).max(2000),
});

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
  if (!businessId) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: ctx.params.id, businessId },
    select: { id: true },
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const notes = await prisma.conversationNote.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(notes);
});

export const POST = withErrorHandling(async (req: Request, ctx: { params: { id: string } }) => {
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

  const conversation = await prisma.conversation.findFirst({
    where: { id: ctx.params.id, businessId },
    select: { id: true },
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = noteSchema.parse(body);

  const note = await prisma.conversationNote.create({
    data: {
      conversationId: conversation.id,
      authorId: session.user.id,
      content: parsed.content,
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(note, { status: 201 });
});
