import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { sendTemplateEmail } from "@/lib/email";

export const POST = withRequestLogging(withErrorHandling(async (req: Request) => {
  const { token, password } = await req.json();
  if (!token || !password) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.used || record.expiresAt < new Date()) {
    return NextResponse.json({ error: "Token invalid or expired" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { token },
      data: { used: true },
    }),
  ]);

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (user) {
    await sendTemplateEmail(user.email, "Password updated", `<p>Your password was reset successfully.</p>`);
  }

  return NextResponse.json({ success: true });
}));
