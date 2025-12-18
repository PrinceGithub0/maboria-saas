import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const txns = await prisma.transaction.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    txns.map((t) => ({ ...t, amount: Number(t.amount) }))
  );
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { amount, currency, status, reference, metadata } = await req.json();
  const txn = await prisma.transaction.create({
    data: { userId: session.user.id, amount, currency, status, reference, metadata },
  });
  return NextResponse.json({ ...txn, amount: Number(txn.amount) }, { status: 201 });
}
