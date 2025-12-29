import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/api-handler";

export const POST = withErrorHandling(async () => {
  return NextResponse.json({ error: "Payment gateway disabled" }, { status: 410 });
});
