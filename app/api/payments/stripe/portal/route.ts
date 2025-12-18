import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createStripeBillingPortal } from "@/lib/payments/stripe";
import { withErrorHandling } from "@/lib/api-handler";

export const POST = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = await createStripeBillingPortal(session.user.id, `${process.env.APP_URL}/dashboard/payments`);
  return NextResponse.json(url);
});
