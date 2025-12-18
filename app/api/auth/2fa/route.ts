import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendEmail } from "@/lib/email";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.twoFactorToken.create({
    data: { userId: session.user.id, code, expiresAt },
  });
  await sendEmail({
    to: session.user.email!,
    subject: "Your Maboria 2FA code",
    html: `<p>Your code: <strong>${code}</strong>. It expires in 10 minutes.</p>`,
  });
  return NextResponse.json({ sent: true });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { code } = await req.json();
  const token = await prisma.twoFactorToken.findFirst({
    where: { userId: session.user.id, code, used: false, expiresAt: { gt: new Date() } },
  });
  if (!token) return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  await prisma.twoFactorToken.update({
    where: { id: token.id },
    data: { used: true },
  });
  return NextResponse.json({ verified: true });
}
