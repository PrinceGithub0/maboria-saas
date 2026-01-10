import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

type AiStyle = "brief" | "detailed";
type AiTone = "balanced" | "direct" | "warm";

const styleValues: AiStyle[] = ["brief", "detailed"];
const toneValues: AiTone[] = ["balanced", "direct", "warm"];

const getKeys = (userId: string) => ({
  styleKey: `ai_style:${userId}`,
  toneKey: `ai_tone:${userId}`,
});

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { styleKey, toneKey } = getKeys(session.user.id);
  const settings = await prisma.setting.findMany({
    where: { key: { in: [styleKey, toneKey] } },
  });
  const style = settings.find((s) => s.key === styleKey)?.value || "brief";
  const tone = settings.find((s) => s.key === toneKey)?.value || "balanced";

  return NextResponse.json({
    style: styleValues.includes(style as AiStyle) ? style : "brief",
    tone: toneValues.includes(tone as AiTone) ? tone : "balanced",
  });
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const style = styleValues.includes(body.style) ? body.style : "brief";
  const tone = toneValues.includes(body.tone) ? body.tone : "balanced";
  const { styleKey, toneKey } = getKeys(session.user.id);

  await prisma.setting.upsert({
    where: { key: styleKey },
    update: { value: style },
    create: { key: styleKey, value: style },
  });
  await prisma.setting.upsert({
    where: { key: toneKey },
    update: { value: tone },
    create: { key: toneKey, value: tone },
  });

  return NextResponse.json({ ok: true, style, tone });
});
