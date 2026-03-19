import { NextResponse } from "next/server";
import { contactSalesSchema } from "@/lib/validators";
import { sendSupportMail } from "@/lib/email";
import { log } from "@/lib/logger";
import { withErrorHandling } from "@/lib/api-handler";

export const POST = withErrorHandling(async (req: Request) => {
  const body = await req.json();
  const parsed = contactSalesSchema.parse(body);

  const recipient =
    process.env.SUPPORT_EMAIL || process.env.EMAIL_SUPPORT_FROM || process.env.EMAIL_FROM || "support@mail.maboria.com";
  const subject = `Contact sales: ${parsed.name}`;
  const html = `<p><strong>Name:</strong> ${parsed.name}</p>
<p><strong>Email:</strong> ${parsed.email}</p>
<p><strong>Company:</strong> ${parsed.company || "-"}</p>
<p><strong>Message:</strong></p>
<pre style="white-space:pre-wrap;">${parsed.message}</pre>`;

  try {
    await sendSupportMail({ to: recipient, subject, html, replyTo: parsed.email });
  } catch (error: any) {
    const message = error?.message || "Failed to send contact request";
    log("error", "contact_sales_email_failed", { error: message });
    return NextResponse.json({ error: `Message saved, but email could not be sent: ${message}` }, { status: 202 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
});
