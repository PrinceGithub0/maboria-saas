import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import path from "path";
import { promises as fs } from "fs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const inline = searchParams.get("inline") === "1";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscription = await prisma.subscription.findFirst({
    where: { userId: session.user.id, receiptUrl: { not: null } },
    orderBy: { receiptIssuedAt: "desc" },
    select: { receiptUrl: true, receiptNumber: true },
  });

  if (!subscription?.receiptUrl) {
    return NextResponse.json({ error: "No receipt found" }, { status: 404 });
  }

  const receiptPath = subscription.receiptUrl.replace(/^\/+/, "");
  const filePath = path.join(process.cwd(), "public", receiptPath);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await fs.readFile(filePath);
  } catch {
    return NextResponse.json({ error: "Receipt file missing" }, { status: 404 });
  }

  const filename = `Maboria_Receipt_${subscription.receiptNumber || "subscription"}.pdf`;
  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    },
  });
});

export const dynamic = "force-dynamic";
