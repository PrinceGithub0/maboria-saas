import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { merchantAccountSchema } from "@/lib/validators";
import { requireBillingAccess } from "@/lib/permissions";

export const GET = withRequestLogging(
  withErrorHandling(async () => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const access = await requireBillingAccess(session.user.id);
    if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const record = await prisma.merchantAccount.findUnique({
      where: { userId: session.user.id },
    });

    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(record);
  })
);

export const PUT = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const access = await requireBillingAccess(session.user.id);
    if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = merchantAccountSchema.parse(await req.json());
    const paystackCode = parsed.paystackSubaccountCode?.trim() || null;
    const flutterwaveId = parsed.flutterwaveSubaccountId?.trim() || null;

    const existing = await prisma.merchantAccount.findUnique({
      where: { userId: session.user.id },
    });

    if (existing?.payoutType === "SEPA" && paystackCode) {
      return NextResponse.json(
        { error: "Paystack is not supported for SEPA payouts." },
        { status: 400 }
      );
    }

    if (!paystackCode && !flutterwaveId) {
      return NextResponse.json(
        { error: "At least one payout account is required." },
        { status: 400 }
      );
    }

    const updated = await prisma.merchantAccount.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        paystackSubaccountCode: paystackCode,
        flutterwaveSubaccountId: flutterwaveId,
      },
      update: {
        paystackSubaccountCode: paystackCode,
        flutterwaveSubaccountId: flutterwaveId,
      },
    });

    return NextResponse.json(updated);
  })
);
