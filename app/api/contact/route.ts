import { NextResponse } from "next/server";
import { contactSalesSchema } from "@/lib/validators";
import { sendInfoMail } from "@/lib/email";
import { log } from "@/lib/logger";
import { withErrorHandling } from "@/lib/api-handler";
import { buildContactSalesEmail } from "@/emails/templates/contact-sales";

export const POST = withErrorHandling(async (req: Request) => {
  const body = await req.json();
  const parsed = contactSalesSchema.parse(body);

  const recipient =
    process.env.CONTACT_SALES_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    process.env.EMAIL_SUPPORT_FROM ||
    process.env.EMAIL_FROM ||
    "support@mail.maboria.com";
  const subject = `New enterprise inquiry: ${parsed.name}`;
  const { html, text } = buildContactSalesEmail(parsed);

  try {
    await sendInfoMail({ to: recipient, subject, html, text, replyTo: parsed.email });
  } catch (error: any) {
    const message = error?.message || "Failed to send contact request";
    log("error", "contact_sales_email_failed", { error: message });
    return NextResponse.json({ error: `Message saved, but email could not be sent: ${message}` }, { status: 202 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
});
