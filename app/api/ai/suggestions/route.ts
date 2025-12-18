import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";
import { prisma } from "@/lib/prisma";

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  assertRateLimit(`ai:suggestions:${session.user.id}`);

  const data = await prisma.invoice.findMany({
    where: { userId: session.user.id },
    take: 10,
  });

  const prompt = `
User invoices: ${JSON.stringify(data)}
Suggest 3 automations for this business based on invoice and activity patterns.
Return JSON: [{title, description, category, trigger, actions}]
`;

  const json = await aiRouter({
    mode: "flow-generate",
    prompt,
    userId: session.user.id,
  });
  return NextResponse.json(JSON.parse(json));
});
