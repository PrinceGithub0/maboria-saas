import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import { subscriptionSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  const normalizedRole = String(session?.user?.role || "").toUpperCase();
  if (
    !session?.user?.id ||
    (normalizedRole !== "OPS_ADMIN" && normalizedRole !== "SUPER_ADMIN")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) {
    return impersonationBlocked;
  }
  const body = await req.json();
  const parsed = subscriptionSchema.partial().parse(body);
  const { id } = await params;
  const sub = await prisma.subscription.update({
    where: { id },
    data: parsed,
  });
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ADMIN_SUB_OVERRIDE", metadata: { subId: id, parsed } },
  });
  return NextResponse.json(sub);
});
