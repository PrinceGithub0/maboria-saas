import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { ACTIVE_ORG_COOKIE_NAME } from "@/lib/org-auth";
import { prisma } from "@/lib/prisma";
import {
  ACCOUNT_ERASURE_CONFIRMATION,
  buildErasedUserEmail,
} from "@/lib/user-privacy";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (String(body?.confirmation || "").trim().toUpperCase() !== ACCOUNT_ERASURE_CONFIRMATION) {
    return NextResponse.json(
      { error: `Type "${ACCOUNT_ERASURE_CONFIRMATION}" to confirm account erasure.` },
      { status: 400 }
    );
  }

  const userId = session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      publicId: true,
      role: true,
      isPlatformUser: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.isPlatformUser) {
    return NextResponse.json(
      { error: "Platform administrator accounts cannot use self-service erasure." },
      { status: 403 }
    );
  }

  const now = new Date();
  const replacementEmail = buildErasedUserEmail(user.id);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        name: "Deleted User",
        email: replacementEmail,
        status: "DISABLED",
        role: "USER",
        authProvider: "PASSWORD",
        isPlatformUser: false,
        emailVerified: null,
        lastLoginAt: null,
        locale: null,
        timeZone: null,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: Prisma.JsonNull,
        requirePasswordReset: false,
        archivedAt: now,
      },
    }),
    prisma.businessMember.updateMany({
      where: { userId: user.id },
      data: { status: "disabled" },
    }),
    prisma.connectedMailbox.updateMany({
      where: { subscriberId: user.id },
      data: {
        status: "DISCONNECTED",
        credentialsEncrypted: null,
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
      },
    }),
    prisma.eInvoicingConnection.updateMany({
      where: { userId: user.id },
      data: {
        status: "DISABLED",
        credentialsEncrypted: null,
        lastError: null,
      },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.account.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.adminStepUpToken.deleteMany({ where: { actorUserId: user.id } }),
    prisma.twoFactorToken.deleteMany({ where: { userId: user.id } }),
    prisma.impersonationSession.deleteMany({
      where: {
        OR: [{ actorUserId: user.id }, { targetUserId: user.id }],
      },
    }),
    prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "USER_ACCOUNT_ERASED",
        resourceType: "user",
        resourceId: user.id,
        metadata: {
          actorUserId: user.id,
          previousEmail: user.email,
          previousName: user.name,
        },
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        targetUserId: user.id,
        action: "USER_ACCOUNT_ERASED",
        actionType: "USER_ACCOUNT_ERASED",
        metadata: {
          previousEmail: user.email,
          previousName: user.name,
          archivedAt: now.toISOString(),
        },
      },
    }),
  ]);

  const response = NextResponse.json({ success: true });
  response.cookies.set(ACTIVE_ORG_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
