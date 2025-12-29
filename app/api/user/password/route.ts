import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { passwordUpdateSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/auth";

export const PUT = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = passwordUpdateSchema.parse(body);
  if (parsed.password !== parsed.confirm) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
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
