import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import {
  businessProfileCreateSchema,
  businessProfileUpdateSchema,
} from "@/lib/validators";
import {
  isSupportedBusinessCurrency,
  normalizeCountryCode,
  normalizeCurrencyCode,
  isSupportedCountry,
} from "@/lib/business-profile";

const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

export const GET = withRequestLogging(withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { userId: session.user.id },
  });

  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(profile);
}));

export const POST = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.businessProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Business profile already exists" }, { status: 409 });
  }

  const parsed = businessProfileCreateSchema.parse(await req.json());
  const country = normalizeCountryCode(parsed.country);
  const currency = normalizeCurrencyCode(parsed.defaultCurrency);

  if (!COUNTRY_CODE_REGEX.test(country) || !isSupportedCountry(country)) {
    return NextResponse.json({ error: "Invalid country code" }, { status: 400 });
  }
  if (!isSupportedBusinessCurrency(currency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }

  const created = await prisma.businessProfile.create({
    data: {
      userId: session.user.id,
      businessName: parsed.businessName.trim(),
      country,
      defaultCurrency: currency,
      businessAddress: parsed.businessAddress?.trim(),
      businessEmail: parsed.businessEmail?.toLowerCase().trim(),
      businessPhone: parsed.businessPhone?.trim(),
      taxId: parsed.taxId?.trim(),
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "BUSINESS_PROFILE_CREATED",
      metadata: { fields: Object.keys(parsed) },
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "BUSINESS_PROFILE_CREATED",
      metadata: { fields: Object.keys(parsed) },
    },
  });

  return NextResponse.json(created, { status: 201 });
}));

export const PUT = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.businessProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Business profile not found" }, { status: 404 });
  }

  const parsed = businessProfileUpdateSchema.parse(await req.json());
  const updateData: Record<string, any> = {};

  if (parsed.businessName) updateData.businessName = parsed.businessName.trim();
  if (parsed.country) {
    const country = normalizeCountryCode(parsed.country);
    if (!COUNTRY_CODE_REGEX.test(country) || !isSupportedCountry(country)) {
      return NextResponse.json({ error: "Invalid country code" }, { status: 400 });
    }
    updateData.country = country;
  }
  if (parsed.defaultCurrency) {
    const currency = normalizeCurrencyCode(parsed.defaultCurrency);
    if (!isSupportedBusinessCurrency(currency)) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }
    updateData.defaultCurrency = currency;
  }
  if (parsed.businessAddress !== undefined) updateData.businessAddress = parsed.businessAddress?.trim();
  if (parsed.businessEmail !== undefined) updateData.businessEmail = parsed.businessEmail?.toLowerCase().trim();
  if (parsed.businessPhone !== undefined) updateData.businessPhone = parsed.businessPhone?.trim();
  if (parsed.taxId !== undefined) updateData.taxId = parsed.taxId?.trim();

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const updated = await prisma.businessProfile.update({
    where: { userId: session.user.id },
    data: updateData,
  });

  const changedFields = Object.keys(updateData).filter((key) => (existing as any)[key] !== (updated as any)[key]);

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "BUSINESS_PROFILE_UPDATED",
      metadata: { fields: changedFields },
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "BUSINESS_PROFILE_UPDATED",
      metadata: { fields: changedFields },
    },
  });

  return NextResponse.json(updated);
}));
