import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { syncUnifiedInboxMailboxReplies } from "@/lib/inbox/mailbox-sync";
import { requireUnifiedInboxAccess } from "@/lib/inbox/unified";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await requireUnifiedInboxAccess(session.user.id);
  const body = await req.json().catch(() => ({}));

  const result = await syncUnifiedInboxMailboxReplies({
    tenantId: context.orgId,
    ownerUserId: context.ownerUserId,
    force: Boolean(body?.force),
  });

  return NextResponse.json({
    ok: true,
    ...result,
  });
});
