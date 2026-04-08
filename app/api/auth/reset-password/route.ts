import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { sendSecurityMail } from "@/lib/email";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { log } from "@/lib/logger";
import {
  buildPasswordUpdatedEmailHtml,
  hashPasswordResetToken,
  maskEmailForLogs,
  resolveAppBaseUrl,
} from "@/lib/password-reset";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_MIN_LENGTH_ERROR,
  validatePasswordPolicy,
} from "@/lib/password-policy";

const resetPasswordSchema = z
  .object({
    token: z.string().min(20),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, PASSWORD_MIN_LENGTH_ERROR)
      .refine(validatePasswordPolicy, PASSWORD_MIN_LENGTH_ERROR),
    confirm: z
      .string()
      .min(MIN_PASSWORD_LENGTH, PASSWORD_MIN_LENGTH_ERROR)
      .refine(validatePasswordPolicy, PASSWORD_MIN_LENGTH_ERROR),
  })
  .refine((value) => value.password === value.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

function badRequestError(message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = 400;
  return error;
}

export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const body = await req.json().catch(() => null);
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequestError(parsed.error.issues[0]?.message || "Invalid payload");
    }

    const hashedToken = hashPasswordResetToken(parsed.data.token);
    const record = await prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
      select: { id: true, userId: true, used: true, expiresAt: true },
    });

    if (!record || record.used || record.expiresAt <= new Date()) {
      throw badRequestError("Reset link is invalid or expired");
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.findUnique({
      where: { id: record.userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw badRequestError("Reset link is invalid or expired");
    }

    await prisma.$transaction(async (tx) => {
      const consumeResult = await tx.passwordResetToken.updateMany({
        where: {
          id: record.id,
          used: false,
          expiresAt: { gt: new Date() },
        },
        data: { used: true },
      });

      if (consumeResult.count !== 1) {
        throw badRequestError("Reset link is invalid or expired");
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          requirePasswordReset: false,
          emailVerified: new Date(),
          status: "ACTIVE",
        },
      });

      // Invalidate any remaining active reset links for the account.
      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          used: false,
        },
        data: { used: true },
      });

      await tx.activityLog.create({
        data: {
          userId: user.id,
          action: "PASSWORD_UPDATED",
          metadata: { source: "password_reset" },
        },
      });
    });

    const baseUrl = resolveAppBaseUrl(req);
    const logoUrl = `${baseUrl}/branding/Maboria%20Company%20logo.png`;
    try {
      await sendSecurityMail({
        to: user.email,
        subject: "Your password was updated",
        html: buildPasswordUpdatedEmailHtml({ logoUrl }),
      });
    } catch (error: any) {
      log("error", "password_reset_confirmation_email_failed", {
        email: maskEmailForLogs(user.email),
        message: error?.message || "unknown",
      });
    }

    return NextResponse.json({ success: true });
  })
);
