import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireNoImpersonationMode } from "@/lib/admin/admin-rbac";
import {
  buildReceiptPreviewPdf,
  RECEIPT_PREVIEW_TYPES,
  type ReceiptPreviewDocumentType,
  type ReceiptPreviewMode,
} from "@/lib/admin/receipt-preview";
import { getActorSystemFlagRole } from "@/lib/system-flags";

const querySchema = z.object({
  type: z.enum(RECEIPT_PREVIEW_TYPES),
  mode: z.enum(["template", "real"]).default("template"),
  id: z.string().trim().min(1).optional(),
  download: z.enum(["0", "1"]).optional(),
});

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    return NextResponse.json({ error: "Invalid preview request.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const { type, mode, id, download } = parsed.data;
  const result = await buildReceiptPreviewPdf({
    type: type as ReceiptPreviewDocumentType,
    mode: mode as ReceiptPreviewMode,
    exampleId: id || null,
  });

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Cache-Control": "no-store",
  });
  headers.set(
    "Content-Disposition",
    `${download === "1" ? "attachment" : "inline"}; filename="${result.filename}"`
  );

  return new NextResponse(new Uint8Array(result.buffer), { status: 200, headers });
});
