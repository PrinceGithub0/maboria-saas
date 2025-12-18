import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";

type Params = { params: { id: string } };

// Minimal placeholder PDF endpoint to satisfy type checks; extend with real PDF generation later.
export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, invoiceId: invoice.id });
});
