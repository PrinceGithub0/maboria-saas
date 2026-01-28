import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { aiRouter } from "@/lib/ai/router";
import { enforceEntitlement, enforceUsageLimit, nextPlanAfter } from "@/lib/entitlements";
import {
  addAiMessage,
  ensureDefaultAiConversation,
  fetchConversationWindow,
  getAiConversationMessages,
} from "@/lib/assistant-conversations";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "ai",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: "starter",
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;
  const conversationId = url.searchParams.get("conversationId");
  const conversation = conversationId
    ? { id: conversationId }
    : (await ensureDefaultAiConversation(session.user.id)) as { id: string };
  const result = await getAiConversationMessages(session.user.id, conversation.id, limit);
  if (conversationId && !result) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  const messages = (result?.messages ?? []) as Array<{
    id: string;
    role: string;
    content: string;
    createdAt?: string | Date;
  }>;
  const history = messages.map((entry) => ({
    id: entry.id,
    role: entry.role,
    content: entry.content,
    createdAt: entry.createdAt,
  }));

  return NextResponse.json({ conversationId: conversation.id, items: history });
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entitlement = await enforceEntitlement(session.user.id, {
    feature: "ai",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: entitlement.type,
        requiredPlan: "starter",
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const usage = await enforceUsageLimit(session.user.id, "aiRequests");
  if (!usage.ok) {
    if (usage.code === "payment_required") {
      return NextResponse.json(
        {
          error: "Payment required",
          type: "payment_required",
          reason: "Active subscription required to use AI",
          plan: usage.plan,
        },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        error: "Upgrade required",
        type: "limit_reached",
        reason: "AI usage limit reached for this month",
        requiredPlan: nextPlanAfter(usage.plan),
        plan: usage.plan,
        limit: usage.limit,
        used: usage.used,
      },
      { status: 402 }
    );
  }

  const { mode, prompt, context, style, tone, conversationId } = await req.json();
  assertRateLimit(`ai:${session.user.id}`);
  const conversation = conversationId
    ? { id: conversationId }
    : (await ensureDefaultAiConversation(session.user.id)) as { id: string };
  const storedUserMessage = await addAiMessage({
    userId: session.user.id,
    conversationId: conversation.id,
    role: "user",
    content: prompt,
  });
  if (!storedUserMessage) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const memory = ((await fetchConversationWindow(session.user.id, conversation.id, 8)) ?? []) as Array<{
    role: string;
    content: string;
  }>;
  const memoryChrono = [...memory].reverse();
  const memoryText = memoryChrono.map((m) => `${m.role}: ${m.content}`).join("\n");

  let resolvedPrompt = prompt;
  if (mode === "assistant" && typeof prompt === "string") {
    const normalized = prompt
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = normalized.split(" ").filter(Boolean);
    const affirmationTokens = new Set([
      "yes",
      "yeah",
      "yep",
      "sure",
      "ok",
      "okay",
      "please",
      "pls",
      "plz",
      "great",
      "sounds",
      "good",
      "proceed",
      "continue",
      "guide",
      "show",
      "steps",
      "step",
      "help",
      "me",
      "this",
      "that",
      "now",
    ]);
    const phraseAffirmations = new Set([
      "go ahead",
      "go on",
      "sure thing",
      "sounds good",
      "all right",
      "alright",
    ]);
    const phraseAffirmationMatch =
      phraseAffirmations.has(normalized) ||
      phraseAffirmations.has(normalized.replace(/\s+please$/, "")) ||
      phraseAffirmations.has(normalized.replace(/\s+now$/, ""));
    const negativeTokens = new Set([
      "no",
      "nope",
      "nah",
      "not",
      "dont",
      "do",
      "not",
      "stop",
      "later",
      "cancel",
      "skip",
    ]);
    const isAffirmationOnly =
      tokens.length > 0 &&
      (tokens.every((t) => affirmationTokens.has(t)) || (phraseAffirmationMatch && tokens.length <= 4));
    const isNegativeOnly = tokens.length > 0 && tokens.every((t) => negativeTokens.has(t));
    const hasConjunction = tokens.includes("but") || tokens.includes("however");
    const isMixedShort = tokens.length <= 6 && hasConjunction;
    if (isAffirmationOnly) {
      const memoryWithoutCurrent = memoryChrono.slice(0, -1);
      const lastUserQuestion =
        [...memoryWithoutCurrent]
          .reverse()
          .find((m) => m.role === "user" && (m.content || "").trim().length > 5)?.content || "";
      const lastAssistant = [...memoryWithoutCurrent].reverse().find((m) => m.role === "assistant")?.content || "";
      const optionMatch = lastAssistant.match(/(?:choose|pick|select|which).+\?/i);
      const hasMultipleOptions = / or /i.test(lastAssistant) || /options?/i.test(lastAssistant);
      if (lastUserQuestion) {
        if (hasMultipleOptions || optionMatch) {
          resolvedPrompt =
            "User said yes but the previous message offered multiple options. Ask which option they want and wait for their choice.";
        } else {
          resolvedPrompt = `User confirmed yes. Provide the requested steps for: ${lastUserQuestion} Ask one specific follow-up question if needed.`;
        }
      } else if (lastAssistant) {
        const questionMatches = lastAssistant.match(/[^?.!]*\?/g);
        const lastQuestion = questionMatches?.[questionMatches.length - 1]?.trim();
        if (lastQuestion) {
          resolvedPrompt = `User confirmed yes. Answer this request: ${lastQuestion} Provide the requested steps now and ask one specific follow-up question if needed.`;
        } else {
          resolvedPrompt =
            "User said yes to the previous assistant message. Provide the requested steps now and ask one specific follow-up question if needed.";
        }
      }
    } else if (isMixedShort) {
      resolvedPrompt =
        "User replied with a short confirmation that includes a condition. Address the condition directly and ask one short follow-up question if needed.";
    } else if (isNegativeOnly) {
      const memoryWithoutCurrent = memoryChrono.slice(0, -1);
      const lastAssistant = [...memoryWithoutCurrent].reverse().find((m) => m.role === "assistant")?.content || "";
      if (lastAssistant) {
        resolvedPrompt =
          "User said no to the previous suggestion. Acknowledge politely and ask what they want help with next.";
      }
    }
  }

  const styleHint =
    mode === "assistant" && style === "detailed"
      ? "Response style: detailed. Provide numbered steps and include one short example or template."
      : "Response style: brief. Keep it concise and practical in 3–5 bullet points.";
  const toneHint =
    tone === "direct"
      ? "Tone: direct and efficient. No fluff."
      : tone === "warm"
        ? "Tone: warm, encouraging, and supportive."
        : "Tone: balanced and professional.";

  const output = await aiRouter({
    mode: mode === "automation" ? "flow-generate" : mode,
    prompt:
      mode === "assistant"
        ? `${styleHint}\n${toneHint}\n${resolvedPrompt}\nRecent memory:\n${memoryText}`
        : `${resolvedPrompt}\nRecent memory:\n${memoryText}`,
    context,
    userId: session.user.id,
  });

  await addAiMessage({
    userId: session.user.id,
    conversationId: conversation.id,
    role: "assistant",
    content: output,
  });
  return NextResponse.json({ answer: output, conversationId: conversation.id });
});
