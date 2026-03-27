import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { isAllowedCurrency } from "@/lib/payments/currency-allowlist";
import { z } from "zod";
import {
  isSupportedBusinessCurrency,
  isSupportedCountry,
  normalizeCountryCode,
  normalizeCurrencyCode,
} from "@/lib/business-profile";
import { getOrCreateBusinessForUser } from "@/lib/business";

const onboardingSchema = z.object({
  businessName: z.string().min(2),
  businessType: z.string().optional(),
  goals: z.string().optional(),
  country: z.string().length(2),
  currency: z.string().length(3),
  businessPhone: z.string().regex(/^\+[1-9]\d{7,14}$/, "Invalid phone number"),
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const activeSubscription = await prisma.subscription.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  if (!activeSubscription) {
    return NextResponse.json({ error: "Active subscription required before onboarding." }, { status: 403 });
  }
  const rawBody = await req.json();
  const parsedResult = onboardingSchema.safeParse(rawBody);
  if (!parsedResult.success) {
    const issue = parsedResult.error.issues[0];
    if (issue?.path?.includes("businessPhone")) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }
    if (issue?.path?.includes("businessName")) {
      return NextResponse.json({ error: "Business name too short" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid onboarding data" }, { status: 400 });
  }
  const parsed = parsedResult.data;
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
      data: {
        onboardingComplete: true,
        ...(isAllowedCurrency(normalizedCurrency) ? { preferredCurrency: normalizedCurrency } : {}),
      },
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
          businessPhone: parsed.businessPhone.trim(),
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

  await getOrCreateBusinessForUser(session.user.id);
  return NextResponse.json({ success: true });
});
