import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { listWorkspaceInvoiceSenders } from "@/lib/invoice-sender-resolver";
import { requireBillingAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireBillingAccess(session.user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: 403 });
  }

  const businessProfile = await prisma.businessProfile.findUnique({
    where: { userId: access.ownerUserId },
    select: { businessEmail: true },
  });

  const senders = await listWorkspaceInvoiceSenders({
    workspaceId: access.businessId,
    replyToAddress: businessProfile?.businessEmail || null,
  });

  return NextResponse.json({
    items: senders.options,
    workspaceDefaultSenderId: senders.workspaceDefaultSenderId,
    workspaceDefaultSenderType: senders.workspaceDefaultSenderType,
    platformFallback: {
      sendMode: "platform_fallback",
      replyToAddress: businessProfile?.businessEmail || null,
    },
  });
});
