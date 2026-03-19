import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import { log } from "@/lib/logger";

function normalize(input: string) {
  return input.trim().toLowerCase();
}

export const POST = withErrorHandling(async (req: Request) => {
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

  const body = await req.json().catch(() => ({}));
  const publicUserId = typeof body.publicUserId === "string" ? body.publicUserId.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";

  if (!publicUserId || !lastName) {
    return NextResponse.json({ error: "User ID and last name are required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { publicId: publicUserId },
    select: { id: true, name: true, publicId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const tokens = normalize(user.name || "").split(/\s+/).filter(Boolean);
  const userLast = tokens.length ? tokens[tokens.length - 1] : "";
  if (!userLast || normalize(lastName) !== userLast) {
    return NextResponse.json({ error: "Last name does not match our records." }, { status: 400 });
  }

  const now = new Date();
  const result = await prisma.subscription.updateMany({
    where: { userId: user.id, status: { in: ["ACTIVE", "PAST_DUE"] } },
    data: {
      status: "CANCELED",
      renewalDate: now,
      cancellationReason: "Admin cancellation",
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "ADMIN_SUBSCRIPTION_CANCELED",
      metadata: {
        targetUserId: user.id,
        publicUserId: user.publicId,
        count: result.count,
      },
    },
  });

  log("info", "admin_subscription_canceled", {
    adminId: session.user.id,
    targetUserId: user.id,
    publicUserId,
    count: result.count,
  });

  return NextResponse.json({ success: true, count: result.count });
});

export const dynamic = "force-dynamic";
