import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendPlatformMail } from "@/lib/email";
import { assertRateLimitAsync } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { log } from "@/lib/logger";
import {
  buildPasswordResetEmailHtml,
  generatePasswordResetToken,
  maskEmailForLogs,
  normalizeEmailAddress,
  resolveAppBaseUrl,
} from "@/lib/password-reset";

const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

const NEUTRAL_RESPONSE = {
  success: true,
  message: "If an account exists for this email, a reset link has been sent.",
};

export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const body = await req.json().catch(() => null);
    const rawForwardedFor = req.headers.get("x-forwarded-for") || "";
    const ip = rawForwardedFor.split(",")[0]?.trim() || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    const parsed = requestPasswordResetSchema.safeParse(body);

    if (!parsed.success) {
      log("warn", "password_reset_request_invalid_payload", { ip, userAgent });
      return NextResponse.json(NEUTRAL_RESPONSE);
    }

    const email = normalizeEmailAddress(parsed.data.email);
    const emailKey = maskEmailForLogs(email);
    log("info", "password_reset_request_received", { email: emailKey, ip });

    try {
      await assertRateLimitAsync(`password-reset:email:${email}`, 3, 60 * 60 * 1000);
      await assertRateLimitAsync(`password-reset:ip:${ip}`, 20, 60 * 60 * 1000);
    } catch (error: any) {
      log("warn", "password_reset_request_rate_limited", {
        email: emailKey,
        ip,
        message: error?.message,
      });
      return NextResponse.json(NEUTRAL_RESPONSE);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      log("info", "password_reset_request_no_account", { email: emailKey, ip });
      return NextResponse.json(NEUTRAL_RESPONSE);
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRequestCount = await prisma.passwordResetToken.count({
      where: {
        userId: user.id,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentRequestCount >= 3) {
      log("warn", "password_reset_request_db_rate_limited", {
        email: emailKey,
        ip,
        userId: user.id,
        recentRequestCount,
      });
      return NextResponse.json(NEUTRAL_RESPONSE);
    }

    const { rawToken, hashedToken, expiresAt } = generatePasswordResetToken();
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          used: false,
        },
        data: { used: true },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: hashedToken,
          expiresAt,
          used: false,
        },
      }),
      prisma.activityLog.create({
        data: {
          userId: user.id,
          action: "PASSWORD_RESET_REQUESTED",
          metadata: {
            ip,
            userAgent,
          },
        },
      }),
    ]);

    const baseUrl = resolveAppBaseUrl(req);
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const logoUrl = `${baseUrl}/branding/Maboria%20Company%20logo.png`;

    try {
      await sendPlatformMail({
        to: email,
        subject: "Reset your Maboria password",
        html: buildPasswordResetEmailHtml({ resetUrl, logoUrl }),
      });
    } catch (error: any) {
      log("error", "password_reset_email_failed", {
        email: emailKey,
        ip,
        message: error?.message || "unknown",
      });
    }

    log("info", "password_reset_request_created", {
      email: emailKey,
      ip,
      expiresAt: expiresAt.toISOString(),
    });
    return NextResponse.json(NEUTRAL_RESPONSE);
  })
);
