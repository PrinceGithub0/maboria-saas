import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const rating = body.rating === "up" || body.rating === "down" ? body.rating : null;
  if (!rating) return NextResponse.json({ error: "Invalid rating" }, { status: 400 });

  const message = typeof body.message === "string" ? body.message.slice(0, 2000) : "";
  const tone = typeof body.tone === "string" ? body.tone : undefined;
  const style = typeof body.style === "string" ? body.style : undefined;

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "AI_FEEDBACK",
      metadata: { rating, tone, style, message },
    },
  });

  return NextResponse.json({ ok: true });
});
