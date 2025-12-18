import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { invoiceSchema } from "@/lib/validators";

type Params = { params: { id: string } };

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(invoice);
});

export const PUT = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = invoiceSchema.partial().parse(body);

  const updated = await prisma.invoice.update({
    where: { id: params.id, userId: session.user.id },
    data: {
      invoiceNumber: parsed.invoiceNumber ?? undefined,
      items: parsed.items ?? undefined,
      currency: parsed.currency ?? undefined,
      status: parsed.status as any,
      tax: parsed.tax as any,
      discount: parsed.discount as any,
    },
  });
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.invoice.delete({
    where: { id: params.id, userId: session.user.id },
  });
  return NextResponse.json({ success: true });
});
