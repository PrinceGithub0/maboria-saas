import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { signupSchema } from "@/lib/validators";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { addDays } from "date-fns";
import { log } from "@/lib/logger";
import { generatePublicId } from "@/lib/public-id";

// Credentials signup endpoint: validates payload, hashes password, prevents duplicates, returns clear errors.
export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const body = await req.json();
    const parsed = signupSchema.parse(body);

    assertRateLimit(`signup:${parsed.email}`);

    const email = parsed.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await hashPassword(parsed.password);
    let created: { id: string; publicId: string | null } | null = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const publicId = generatePublicId();
      try {
        created = await prisma.user.create({
          data: {
            name: parsed.name,
            email,
            passwordHash,
            role: "USER",
            publicId,
          },
          select: { id: true, publicId: true },
        });
        break;
      } catch (error: any) {
        if (error?.code === "P2002") {
          const targets = Array.isArray(error?.meta?.target) ? error.meta.target : [];
          if (targets.includes("email")) {
            return NextResponse.json({ error: "Email already in use" }, { status: 409 });
          }
          if (targets.includes("publicId")) {
            continue;
          }
        }
        throw error;
      }
    }

    if (!created) {
      return NextResponse.json({ error: "Unable to create a unique user ID" }, { status: 500 });
    }

    const intent = parsed.planIntent;
    if (intent === "trial") {
      // 7-day trial by default (maps to "Pro" features via SubscriptionPlan.GROWTH).
      const trialEndsAt = addDays(new Date(), 7);
      try {
        const trial = await prisma.subscription.create({
          data: {
            userId: created.id,
            plan: "GROWTH",
            status: "TRIALING",
            renewalDate: trialEndsAt,
            trialEndsAt,
            currency: "NGN",
            interval: "monthly",
          },
        });
        await prisma.activityLog.create({
          data: {
            userId: created.id,
            action: "TRIAL_STARTED",
            metadata: { trialEndsAt: trial.trialEndsAt, subscriptionId: trial.id },
          },
        });
      } catch (error: any) {
        log("warn", "Trial subscription create failed", { userId: created.id, error: error?.message });
      }
    } else {
      const plan = intent === "starter" ? "STARTER" : "GROWTH";
      await prisma.activityLog.create({
        data: {
          userId: created.id,
          action: "PLAN_INTENT",
          metadata: { plan, autoRenew: true },
        },
      });
    }

    return NextResponse.json(
      { success: true, userId: created.publicId, planIntent: intent },
      { status: 201 }
    );
  })
);
