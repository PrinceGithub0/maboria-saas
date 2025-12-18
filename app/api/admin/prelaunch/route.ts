import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const health = await prisma.$queryRaw`SELECT 1`;
  const checklist = [
    { item: "API health", status: "ok" },
    { item: "Database", status: health ? "ok" : "fail" },
    { item: "Webhooks configured", status: "pending" },
    { item: "Billing live mode", status: "pending" },
    { item: "Emails sending", status: "pending" },
    { item: "Admin panel", status: "ok" },
    { item: "Logging/Monitoring", status: "pending" },
  ];
  return NextResponse.json(checklist);
});
