import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode, requirePlatformAdmin } from "@/lib/admin/admin-rbac";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const denied = requirePlatformAdmin(session?.user);
  if (denied) return denied;
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session!.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;
  return NextResponse.json({ error: "Trials are disabled." }, { status: 410 });
});
