import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { category, amount, period } = await req.json();
  const usage = await prisma.usageRecord.create({
    data: { userId: session.user.id, category, amount, period },
  });
  return NextResponse.json(usage, { status: 201 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usage = await prisma.usageRecord.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const [automationRuns, invoices, aiRequests] = await Promise.all([
    prisma.automationRun.count({ where: { userId: session.user.id, createdAt: { gte: start } } }),
    prisma.invoice.count({ where: { userId: session.user.id, generatedAt: { gte: start } } }),
    prisma.aiUsageLog.count({ where: { userId: session.user.id, createdAt: { gte: start } } }),
  ]);
  const currentKey = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  const existingKeys = new Set(
    usage.map((row) => `${row.category}:${row.createdAt.toISOString().slice(0, 7)}`)
  );
  const summary = [
    {
      id: `summary-automation-${start.toISOString()}`,
      category: "Automation runs",
      amount: automationRuns,
      period: "monthly",
      createdAt: now,
    },
    {
      id: `summary-invoices-${start.toISOString()}`,
      category: "Invoices",
      amount: invoices,
      period: "monthly",
      createdAt: now,
    },
    {
      id: `summary-ai-${start.toISOString()}`,
      category: "AI requests",
      amount: aiRequests,
      period: "monthly",
      createdAt: now,
    },
  ].filter((row) => !existingKeys.has(`${row.category}:${currentKey}`));
  return NextResponse.json([...summary, ...usage]);
}
