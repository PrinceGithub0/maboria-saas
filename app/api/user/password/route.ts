import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { passwordUpdateSchema } from "@/lib/validators";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { PASSWORD_MIN_LENGTH_ERROR } from "@/lib/password-policy";

export const PUT = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsedResult = passwordUpdateSchema.safeParse(body);
  if (!parsedResult.success) {
    const passwordTooShort = parsedResult.error.issues.some((issue) => {
      const field = issue.path[0];
      return (field === "password" || field === "confirm") && issue.message === PASSWORD_MIN_LENGTH_ERROR;
    });
    if (passwordTooShort) {
      return NextResponse.json({ error: PASSWORD_MIN_LENGTH_ERROR }, { status: 400 });
    }
    throw parsedResult.error;
  }
  const parsed = parsedResult.data;
  if (parsed.password !== parsed.confirm) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const currentPasswordValid = await verifyPassword(parsed.currentPassword, user.passwordHash);
  if (!currentPasswordValid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.password);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash },
  });

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "PASSWORD_UPDATED",
    },
  });

  return NextResponse.json({ success: true }, { status: 200 });
}));
