import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { signupSchema } from "@/lib/validators";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { addDays } from "date-fns";
import { log } from "@/lib/logger";

// Credentials signup endpoint: validates payload, hashes password, prevents duplicates, returns clear errors.
export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const body = await req.json();
    const parsed = signupSchema.parse(body);

    assertRateLimit(`signup:${parsed.email}`);

    const existing = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await hashPassword(parsed.password);
    const created = await prisma.user.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        passwordHash,
        role: "USER",
      },
    });

    // 7-day trial by default (maps to "Pro" features via SubscriptionPlan.GROWTH).
    const trialEndsAt = addDays(new Date(), 7);
    await prisma.subscription
      .create({
        data: {
          userId: created.id,
          plan: "GROWTH",
          status: "TRIALING",
          renewalDate: trialEndsAt,
          trialEndsAt,
          currency: "NGN",
          interval: "monthly",
        },
      })
      .catch((error) => log("warn", "Trial subscription create failed", { userId: created.id, error: error?.message }));

    return NextResponse.json({ success: true }, { status: 201 });
  })
);
