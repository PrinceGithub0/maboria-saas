import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { supportTicketSchema } from "@/lib/validators";
import { sendEmail } from "@/lib/email";
import { log } from "@/lib/logger";
import { ensureUserPublicId } from "@/lib/public-id";
import { assertRateLimit } from "@/lib/rate-limit";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tickets = await prisma.supportTicket.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tickets);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    assertRateLimit(`support:${session.user.id}`);
    const body = await req.json();
    const parsed = supportTicketSchema.parse(body);
    const publicId = await ensureUserPublicId(session.user.id);
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: session.user.id,
        title: parsed.title,
        message: parsed.message,
        metadata: { userId: session.user.id, publicId, publicUserId: publicId, public_user_id: publicId },
      },
    });

    // Notify support email; if delivery fails, record error but keep ticket
    const supportRecipient = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "info@maboria.com";
    let emailError: string | null = null;
    try {
      await sendEmail({
        to: supportRecipient,
        subject: `New support ticket: ${parsed.title} (User ID: ${publicId})`,
        html: `<p>A new support ticket was submitted.</p>
<p><strong>User:</strong> ${session.user.email}</p>
<p><strong>User ID:</strong> ${publicId}</p>
<p><strong>Title:</strong> ${parsed.title}</p>
<p><strong>Message:</strong></p>
<pre style="white-space:pre-wrap;">${parsed.message}</pre>`,
      });
    } catch (err: any) {
      emailError = err?.message || "Failed to send support email";
      log("error", "support_email_failed", { error: emailError });
    }

    return NextResponse.json({ ticket, emailError }, { status: emailError ? 202 : 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "Failed to submit ticket" }, { status: 400 });
  }
}
