import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireOrgPermission, writeOrgAuditLog } from "@/lib/org-auth";
import {
  canFallbackBusinessLogoStorage,
  deleteLegacyBusinessLogoFiles,
  readBusinessLogoInfo,
  writeLegacyBusinessLogoFile,
} from "@/lib/business-logo";
import { prisma } from "@/lib/prisma";

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml"]);

async function requireSessionAndOrg(permission: "settings:business:read" | "settings:business:write") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const access = await requireOrgPermission(session.user.id, {
    permission,
    requireActiveSubscription: true,
  });

  if (!access.ok) {
    return {
      error: NextResponse.json({ error: access.message, code: access.code }, { status: access.status }),
    };
  }

  return {
    userId: access.context.ownerUserId,
    actorUserId: session.user.id,
    orgId: access.context.orgId,
  };
}

export async function GET() {
  const access = await requireSessionAndOrg("settings:business:read");
  if (access.error) return access.error;

  const info = await readBusinessLogoInfo(access.userId);
  if (!info) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(info.buffer), {
    status: 200,
    headers: {
      "Content-Type": info.mime,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

export async function POST(req: Request) {
  const access = await requireSessionAndOrg("settings:business:write");
  if (access.error) return access.error;

  const formData = await req.formData();
  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Logo file missing" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_LOGO_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum logo size is 2 MB. Please upload smaller file." },
      { status: 400 }
    );
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { userId: access.userId },
    select: { id: true, updatedAt: true },
  });
  if (!profile) {
    return NextResponse.json({ error: "Business profile not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let url: string;
  try {
    const updated = await prisma.businessProfile.update({
      where: { userId: access.userId },
      data: {
        logoData: buffer,
        logoMimeType: file.type,
      },
      select: { updatedAt: true },
    });
    await deleteLegacyBusinessLogoFiles(access.userId);
    url = `/api/business-profile/logo?v=${updated.updatedAt.getTime()}`;
  } catch (error) {
    if (!canFallbackBusinessLogoStorage(error)) throw error;
    url = await writeLegacyBusinessLogoFile(access.userId, file.type, buffer);
  }

  await writeOrgAuditLog({
    orgId: access.orgId,
    actorUserId: access.actorUserId,
    targetUserId: access.userId,
    actionType: "BUSINESS_LOGO_UPDATED",
    metadata: {
      mimeType: file.type,
      size: file.size,
    },
  });

  return NextResponse.json({
    success: true,
    url,
  });
}

export async function DELETE() {
  const access = await requireSessionAndOrg("settings:business:write");
  if (access.error) return access.error;

  try {
    await prisma.businessProfile.updateMany({
      where: { userId: access.userId },
      data: {
        logoData: null,
        logoMimeType: null,
      },
    });
  } catch (error) {
    if (!canFallbackBusinessLogoStorage(error)) throw error;
  }
  await deleteLegacyBusinessLogoFiles(access.userId);

  await writeOrgAuditLog({
    orgId: access.orgId,
    actorUserId: access.actorUserId,
    targetUserId: access.userId,
    actionType: "BUSINESS_LOGO_DELETED",
  });

  return NextResponse.json({ success: true });
}
