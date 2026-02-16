import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { hashPasswordResetToken } from "@/lib/password-reset";

const validateTokenSchema = z.object({
  token: z.string().min(20),
});

export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const body = await req.json().catch(() => null);
    const parsed = validateTokenSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ valid: false, reason: "invalid" });
    }

    const hashedToken = hashPasswordResetToken(parsed.data.token);
    const record = await prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
      select: { expiresAt: true, used: true },
    });

    if (!record) {
      return NextResponse.json({ valid: false, reason: "invalid" });
    }

    if (record.used) {
      return NextResponse.json({ valid: false, reason: "used" });
    }

    if (record.expiresAt <= new Date()) {
      return NextResponse.json({ valid: false, reason: "expired" });
    }

    return NextResponse.json({ valid: true });
  })
);
