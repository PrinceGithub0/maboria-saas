import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import {
  listReceiptPreviewExamples,
  RECEIPT_PREVIEW_TYPES,
  type ReceiptPreviewDocumentType,
} from "@/lib/admin/receipt-preview";
import { getActorSystemFlagRole } from "@/lib/system-flags";

const querySchema = z.object({
  type: z.enum(RECEIPT_PREVIEW_TYPES),
});

export const dynamic = "force-dynamic";

export const GET = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const role = await getActorSystemFlagRole(session.user.id);
  if (role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can access receipt preview.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const impersonationBlocked = await requireNoImpersonationMode({
    actorUserId: session.user.id,
    cookieHeader: req.headers.get("cookie"),
  });
  if (impersonationBlocked) return impersonationBlocked;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid document type.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const items = await listReceiptPreviewExamples(parsed.data.type as ReceiptPreviewDocumentType);
  return NextResponse.json({ items });
});
