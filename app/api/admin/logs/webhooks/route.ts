import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { requirePlatformAdmin } from "@/lib/admin/admin-rbac";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }, { status: 401 });
  const denied = requirePlatformAdmin(session.user);
  if (denied) return denied;

  const url = new URL(req.url);
  const rawPage = Number(url.searchParams.get("page") || 1);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const take = 50;
  const status = url.searchParams.get("status") || undefined;
  const provider = url.searchParams.get("provider") || undefined;
  const query = url.searchParams.get("q")?.trim();
  const logs = await prisma.webhookEvent.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(provider ? { provider } : {}),
      ...(query ? { eventId: { contains: query, mode: "insensitive" } } : {}),
    },
    orderBy: { receivedAt: "desc" },
    skip: (page - 1) * take,
    take,
  });
  return NextResponse.json(logs);
});
