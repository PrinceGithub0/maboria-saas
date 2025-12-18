import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { sendTemplateEmail } from "@/lib/email";
import { addDays } from "date-fns";

export const POST = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const cutoff = addDays(new Date(), 3);
  const subs = await prisma.subscription.findMany({
    where: { status: "TRIALING", trialEndsAt: { lte: cutoff } },
    include: { user: true },
  });
  for (const sub of subs) {
    await sendTemplateEmail(
      sub.user.email,
      "Trial ending soon",
      `<p>Your trial ends on ${sub.trialEndsAt?.toDateString()}. Add a payment method to continue.</p>`
    );
  }
  return NextResponse.json({ sent: subs.length });
});
