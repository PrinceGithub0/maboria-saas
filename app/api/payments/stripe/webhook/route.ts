import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";

export const POST = withErrorHandling(async () => {
  return NextResponse.json({ error: "Webhook disabled" }, { status: 410 });
});

export const dynamic = "force-dynamic";
