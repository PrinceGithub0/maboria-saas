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
import { hasRequiredAddress, parseBusinessAddress } from "@/lib/address";
import { normalizeVatSettings } from "@/lib/vat";
import path from "path";
import fs from "fs/promises";

const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;
const REQUIRED_MESSAGE = "This field is required";
const LOGO_DIR = path.join(process.cwd(), "uploads", "business-logos");

const getLogoUrl = async (userId: string) => {
  try {
    const files = await fs.readdir(LOGO_DIR);
    const match = files.find((file) => file.startsWith(`${userId}.`));
    if (!match) return null;
    const stat = await fs.stat(path.join(LOGO_DIR, match));
    return `/api/business-profile/logo?v=${stat.mtimeMs}`;
  } catch {
    return null;
  }
};

export const GET = withRequestLogging(withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileClient = (prisma as any).businessProfile;
  if (!profileClient) {
    return NextResponse.json(
      { error: "BusinessProfile model not available. Run `npx prisma generate` and restart." },
      { status: 500 }
    );
  }

  const profile = await profileClient.findUnique({
    where: { userId: session.user.id },
  });

  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const logoUrl = await getLogoUrl(session.user.id);
  return NextResponse.json({ ...profile, logoUrl });
}));

export const POST = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileClient = (prisma as any).businessProfile;
  if (!profileClient) {
    return NextResponse.json(
      { error: "BusinessProfile model not available. Run `npx prisma generate` and restart." },
      { status: 500 }
    );
  }

  const existing = await profileClient.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Business profile already exists" }, { status: 409 });
  }

  const parsed = businessProfileCreateSchema.parse(await req.json());
  const country = normalizeCountryCode(parsed.country);
  const currency = normalizeCurrencyCode(parsed.defaultCurrency);
  const addressFields = parseBusinessAddress(parsed.businessAddress);
  const vatSettings = normalizeVatSettings({
    enabled: parsed.vatEnabled ?? false,
    rate: parsed.vatRate ?? 0,
    mode: parsed.vatPricingMode ?? "exclusive",
  });

  if (!parsed.businessName?.trim()) {
    return NextResponse.json({ error: REQUIRED_MESSAGE }, { status: 400 });
  }
  if (!parsed.businessEmail?.trim()) {
    return NextResponse.json({ error: REQUIRED_MESSAGE }, { status: 400 });
  }
  if (!parsed.businessPhone?.trim()) {
    return NextResponse.json({ error: REQUIRED_MESSAGE }, { status: 400 });
  }
  if (!parsed.businessAddress?.trim() || !hasRequiredAddress(addressFields)) {
    return NextResponse.json({ error: REQUIRED_MESSAGE }, { status: 400 });
  }
  if (!COUNTRY_CODE_REGEX.test(country) || !isSupportedCountry(country)) {
    return NextResponse.json({ error: "Invalid country code" }, { status: 400 });
  }
  if (!isSupportedBusinessCurrency(currency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }
  if (parsed.vatEnabled && (parsed.vatRate === undefined || parsed.vatRate === null)) {
    return NextResponse.json({ error: REQUIRED_MESSAGE }, { status: 400 });
  }
  if (parsed.vatRate !== undefined && (parsed.vatRate < 0 || parsed.vatRate > 30)) {
    return NextResponse.json({ error: "Invalid VAT rate" }, { status: 400 });
  }

  const created = await profileClient.create({
    data: {
      userId: session.user.id,
      businessName: parsed.businessName.trim(),
      country,
      defaultCurrency: currency,
      businessAddress: parsed.businessAddress?.trim(),
      businessEmail: parsed.businessEmail?.toLowerCase().trim(),
      businessPhone: parsed.businessPhone?.trim(),
      taxId: parsed.taxId?.trim(),
      vatEnabled: vatSettings.enabled,
      vatRate: vatSettings.enabled ? vatSettings.rate : 0,
      vatPricingMode: vatSettings.mode.toUpperCase(),
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

  const profileClient = (prisma as any).businessProfile;
  if (!profileClient) {
    return NextResponse.json(
      { error: "BusinessProfile model not available. Run `npx prisma generate` and restart." },
      { status: 500 }
    );
  }

  const existing = await profileClient.findUnique({
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
  if (parsed.vatEnabled !== undefined) {
    updateData.vatEnabled = parsed.vatEnabled;
    if (parsed.vatEnabled === false && parsed.vatRate === undefined) {
      updateData.vatRate = 0;
    }
  }
  if (parsed.vatRate !== undefined) updateData.vatRate = parsed.vatRate;
  if (parsed.vatPricingMode !== undefined) {
    updateData.vatPricingMode = parsed.vatPricingMode.toUpperCase();
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const nextProfile = {
    businessName: updateData.businessName ?? existing.businessName,
    country: updateData.country ?? existing.country,
    defaultCurrency: updateData.defaultCurrency ?? existing.defaultCurrency,
    businessAddress: updateData.businessAddress ?? existing.businessAddress,
    businessEmail: updateData.businessEmail ?? existing.businessEmail,
    businessPhone: updateData.businessPhone ?? existing.businessPhone,
    taxId: updateData.taxId ?? existing.taxId,
    vatEnabled: updateData.vatEnabled ?? existing.vatEnabled ?? false,
    vatRate: updateData.vatRate ?? existing.vatRate ?? 0,
    vatPricingMode: updateData.vatPricingMode ?? existing.vatPricingMode ?? "EXCLUSIVE",
  };
  const nextAddress = parseBusinessAddress(nextProfile.businessAddress);
  if (
    !nextProfile.businessName?.trim() ||
    !nextProfile.country?.trim() ||
    !nextProfile.defaultCurrency?.trim() ||
    !nextProfile.businessEmail?.trim() ||
    !nextProfile.businessPhone?.trim() ||
    !nextProfile.taxId?.trim() ||
    !nextProfile.businessAddress?.trim() ||
    !hasRequiredAddress(nextAddress)
  ) {
    return NextResponse.json({ error: REQUIRED_MESSAGE }, { status: 400 });
  }
  if (nextProfile.vatEnabled && (nextProfile.vatRate === null || nextProfile.vatRate === undefined)) {
    return NextResponse.json({ error: REQUIRED_MESSAGE }, { status: 400 });
  }
  if (nextProfile.vatRate !== null && (Number(nextProfile.vatRate) < 0 || Number(nextProfile.vatRate) > 30)) {
    return NextResponse.json({ error: "Invalid VAT rate" }, { status: 400 });
  }

  const updated = await profileClient.update({
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
