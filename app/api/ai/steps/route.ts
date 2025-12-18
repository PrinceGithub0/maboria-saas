import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { description } = await req.json();
  assertRateLimit(`ai:steps:${session.user.id}`);
  const json = await aiRouter({
    mode: "step-generate",
    prompt: description,
    userId: session.user.id,
  });
  return NextResponse.json(JSON.parse(json));
});
