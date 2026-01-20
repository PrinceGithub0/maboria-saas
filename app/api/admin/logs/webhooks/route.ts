import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || 1);
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
