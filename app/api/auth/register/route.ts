import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { signupSchema } from "@/lib/validators";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";

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
    await prisma.user.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        passwordHash,
        role: "USER",
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  })
);
