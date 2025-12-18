import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeAutomationRun } from "@/lib/automation/engine";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "/";
  const payload = await req.json().catch(() => ({}));

  const triggers = await prisma.trigger.findMany({
    where: { type: "webhook", config: { path: ["path"], equals: path } },
    include: { flow: true },
  });

  for (const trigger of triggers) {
    await executeAutomationRun(trigger.flow, payload);
  }

  return NextResponse.json({ received: true, triggered: triggers.length });
}

export const dynamic = "force-dynamic";
