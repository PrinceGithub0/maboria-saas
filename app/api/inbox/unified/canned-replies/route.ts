import { SubscriptionPlan } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/lib/api-handler";
import { authOptions } from "@/lib/auth";
import { requireUnifiedInboxAccess } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

const replySchema = z.object({
  title: z.string().min(2).max(80),
  content: z.string().min(2).max(2000),
});

function starterSavedReplyLimit(plan: SubscriptionPlan | null) {
  if (!plan) return 0;
  if (plan === "STARTER") return 3;
  return null;
}

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await requireUnifiedInboxAccess(session.user.id);
  const items = await prisma.cannedReply.findMany({
    where: { businessId: context.orgId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ items });
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await requireUnifiedInboxAccess(session.user.id);
  const body = await req.json().catch(() => ({}));
  const parsed = replySchema.parse(body);

  const limit = starterSavedReplyLimit(context.orgPlan);
  if (limit !== null) {
    const used = await prisma.cannedReply.count({
      where: { businessId: context.orgId },
    });
    if (used >= limit) {
      return NextResponse.json(
        {
          error: "Saved replies limit reached",
          type: "limit_reached",
          used,
          limit,
        },
        { status: 403 }
      );
    }
  }

  const created = await prisma.cannedReply.create({
    data: {
      businessId: context.orgId,
      userId: session.user.id,
      title: parsed.title,
      content: parsed.content,
    },
  });

  return NextResponse.json(created, { status: 201 });
});
