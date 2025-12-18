import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { fetchRecentMemory, rememberAssistantMessage } from "@/lib/assistant-memory";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { aiRouter } from "@/lib/ai/router";

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { mode, prompt, context } = await req.json();
  assertRateLimit(`ai:${session.user.id}`);
  await rememberAssistantMessage(session.user.id, "user", prompt);
  const memory = await fetchRecentMemory(session.user.id);
  const memoryText = memory.map((m) => `${m.role}: ${m.content}`).join("\n");

  const output = await aiRouter({
    mode: mode === "automation" ? "flow-generate" : mode,
    prompt: `${prompt}\nRecent memory:\n${memoryText}`,
    context,
    userId: session.user.id,
  });

  await rememberAssistantMessage(session.user.id, "assistant", output);
  return NextResponse.json({ answer: output });
});
