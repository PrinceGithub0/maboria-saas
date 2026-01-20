import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const flags = await prisma.setting.findMany();
  return NextResponse.json(flags);
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { key, value } = await req.json();
  if (!key) return NextResponse.json({ error: "Missing flag key." }, { status: 400 });
  const normalizedValue =
    typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value: normalizedValue },
    create: { key, value: normalizedValue },
  });
  await prisma.activityLog.create({
    data: { userId: session.user.id, action: "ADMIN_FLAG_UPDATE", metadata: { key, value: normalizedValue } },
  });
  return NextResponse.json(setting);
});
