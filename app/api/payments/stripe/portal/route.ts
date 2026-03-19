import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { requireOrgPermission } from "@/lib/org-auth";
import { createStripeBillingPortalSession } from "@/lib/payments/stripe";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "subscription:manage",
    requireActiveSubscription: false,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  const orgSubscription = await prisma.orgSubscription.findUnique({
    where: { orgId: access.context.orgId },
    select: {
      provider: true,
      providerCustomerId: true,
    },
  });

  if (orgSubscription?.provider !== "STRIPE" || !orgSubscription.providerCustomerId) {
    return NextResponse.json(
      { error: "Stripe billing portal is not available for this account." },
      { status: 400 }
    );
  }

  const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || new URL(req.url).origin;
  const portal = await createStripeBillingPortalSession({
    customerId: orgSubscription.providerCustomerId,
    returnUrl: `${appUrl}/dashboard/subscription`,
  });

  if (!portal.url) {
    return NextResponse.json({ error: "Could not create Stripe billing portal session." }, { status: 502 });
  }

  return NextResponse.json({ url: portal.url });
});
