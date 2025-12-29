import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { getUserPlan } from "@/lib/entitlements";
import { ensureUserPublicId } from "@/lib/public-id";
import { profileUpdateSchema } from "@/lib/validators";

export const GET = withRequestLogging(withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      publicId: true,
      name: true,
      email: true,
      role: true,
      onboardingComplete: true,
      tourComplete: true,
      preferredCurrency: true,
      subscriptions: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let publicId = user.publicId;
  if (!publicId) {
    publicId = await ensureUserPublicId(session.user.id);
  }

  const plan = await getUserPlan(session.user.id);
  return NextResponse.json({ ...user, publicId, publicUserId: publicId, plan });
}));

export const PUT = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = profileUpdateSchema.parse(body);
  const email = parsed.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== session.user.id) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: { name: parsed.name, email },
    select: { id: true, name: true, email: true, publicId: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "PROFILE_UPDATED",
      metadata: { fields: ["name", "email"] },
    },
  });

  let publicId = updated.publicId;
  if (!publicId) {
    publicId = await ensureUserPublicId(session.user.id);
  }

  return NextResponse.json({ ...updated, publicId, publicUserId: publicId }, { status: 200 });
}));
