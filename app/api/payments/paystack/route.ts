import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { initializePaystackTransaction } from "@/lib/payments/paystack";
import { prisma } from "@/lib/prisma";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";

export const POST = withRequestLogging(withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { amount, currency } = await req.json();
  assertRateLimit(`paystack:${session.user.id}`, 20, 60_000);
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const init = await initializePaystackTransaction({
    amount,
    currency: currency || "NGN",
    email: user.email,
    callback_url: `${process.env.APP_URL}/dashboard/payments?provider=paystack`,
    metadata: { userId: user.id },
  });
  return NextResponse.json(init);
}));
