import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { buildOtpauthUrl, generateBackupCodes, generateTotpSecret, verifyTotp } from "@/lib/totp";
import { withErrorHandling } from "@/lib/api-handler";

type StoredBackupCode = { hash: string; usedAt: string | null };

function normalizeBackupCodes(value: unknown): StoredBackupCode[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const hash = (c as any).hash;
      const usedAt = (c as any).usedAt ?? null;
      if (typeof hash !== "string") return null;
      if (usedAt !== null && typeof usedAt !== "string") return null;
      return { hash, usedAt };
    })
    .filter(Boolean) as StoredBackupCode[];
}

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorEnabled: true },
  });

  return NextResponse.json({ enabled: Boolean(user?.twoFactorEnabled) });
});

// Start setup: generate secret (does NOT enable 2FA yet)
export const POST = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, twoFactorEnabled: true, twoFactorSecret: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.twoFactorEnabled) return NextResponse.json({ enabled: true });

  const secret = user.twoFactorSecret || generateTotpSecret();
  if (!user.twoFactorSecret) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { twoFactorSecret: secret },
    });
  }

  const uri = buildOtpauthUrl({
    secret,
    issuer: "Maboria",
    label: user.email,
  });

  return NextResponse.json({ enabled: false, secret, uri });
});

// Confirm setup: verify code and enable 2FA + generate backup codes (returned once)
export const PUT = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { code } = await req.json();
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "2FA code is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorEnabled: true, twoFactorSecret: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.twoFactorEnabled) return NextResponse.json({ enabled: true });
  if (!user.twoFactorSecret) {
    return NextResponse.json({ error: "Start setup first" }, { status: 400 });
  }

  const ok = verifyTotp({ secret: user.twoFactorSecret, token: code });
  if (!ok) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  const backupCodes = generateBackupCodes(10);
  const storedCodes: StoredBackupCode[] = [];
  for (const c of backupCodes) {
    const hash = await hashPassword(c);
    storedCodes.push({ hash, usedAt: null });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorBackupCodes: storedCodes as any,
    },
  });

  return NextResponse.json({ enabled: true, backupCodes });
});

// Disable 2FA with a valid TOTP or unused backup code
export const DELETE = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { code } = await req.json();
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "2FA code or backup code is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user.twoFactorEnabled) return NextResponse.json({ enabled: false });

  let verified = false;

  if (user.twoFactorSecret && /^\d{6}$/.test(code.replace(/\s+/g, ""))) {
    verified = verifyTotp({ secret: user.twoFactorSecret, token: code });
  }

  if (!verified) {
    const stored = normalizeBackupCodes(user.twoFactorBackupCodes);
    for (const entry of stored) {
      if (entry.usedAt) continue;
      // reuse bcrypt compare helper
      const ok = await verifyPassword(code.trim(), entry.hash);
      if (ok) {
        verified = true;
        break;
      }
    }
  }

  if (!verified) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null },
  });

  return NextResponse.json({ enabled: false });
});

