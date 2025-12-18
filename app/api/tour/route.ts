import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { complete } = await req.json();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { tourComplete: !!complete },
  });
  return NextResponse.json({ success: true });
}
