import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";

export const POST = withRequestLogging(withErrorHandling(async (req: Request) => {
  const { email } = await req.json();
  assertRateLimit(`forgot:${email}`);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ success: true }); // avoid leaking
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt },
  });

  const resetUrl = `${process.env.APP_URL}/reset?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Reset your password",
    html: `<p>Reset your password by clicking <a href="${resetUrl}">here</a>. This link expires in 1 hour.</p>`,
  });

  return NextResponse.json({ success: true });
}));
