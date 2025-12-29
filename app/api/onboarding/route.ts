import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { z } from "zod";
import {
  isSupportedBusinessCurrency,
  isSupportedCountry,
  normalizeCountryCode,
  normalizeCurrencyCode,
} from "@/lib/business-profile";

const onboardingSchema = z.object({
  businessName: z.string().min(2),
  businessType: z.string().optional(),
  goals: z.string().optional(),
  country: z.string().length(2),
  currency: z.string().length(3),
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = onboardingSchema.parse(await req.json());
  const normalizedCurrency = normalizeCurrencyCode(parsed.currency || "USD");
  const normalizedCountry = normalizeCountryCode(parsed.country);

  if (!isSupportedBusinessCurrency(normalizedCurrency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }
  if (!isSupportedCountry(normalizedCountry)) {
    return NextResponse.json({ error: "Invalid country code" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: session.user.id },
      data: { onboardingComplete: true, preferredCurrency: normalizedCurrency },
    });

    const existing = await tx.businessProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!existing) {
      const created = await tx.businessProfile.create({
        data: {
          userId: session.user.id,
          businessName: parsed.businessName.trim(),
          country: normalizedCountry,
          defaultCurrency: normalizedCurrency,
        },
      });
      const auditPayload = { fields: ["businessName", "country", "defaultCurrency"], source: "onboarding" };
      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "BUSINESS_PROFILE_CREATED",
          metadata: auditPayload,
          resourceType: "business_profile",
          resourceId: created.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "BUSINESS_PROFILE_CREATED",
          metadata: auditPayload,
        },
      });
    }

    await tx.activityLog.create({
      data: {
        userId: session.user.id,
        action: "ONBOARDING_COMPLETE",
        metadata: {
          businessType: parsed.businessType,
          goals: parsed.goals,
          currency: normalizedCurrency,
          country: normalizedCountry,
        },
      },
    });
  });
  return NextResponse.json({ success: true });
});
