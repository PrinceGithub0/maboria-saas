import { NextResponse } from "next/server";
import { contactSalesSchema } from "@/lib/validators";
import { sendEmail } from "@/lib/email";
import { log } from "@/lib/logger";
import { withErrorHandling } from "@/lib/api-handler";

export const POST = withErrorHandling(async (req: Request) => {
  const body = await req.json();
  const parsed = contactSalesSchema.parse(body);

  const recipient = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "info@maboria.com";
  const subject = `Contact sales: ${parsed.name}`;
  const html = `<p><strong>Name:</strong> ${parsed.name}</p>
<p><strong>Email:</strong> ${parsed.email}</p>
<p><strong>Company:</strong> ${parsed.company || "-"}</p>
<p><strong>Message:</strong></p>
<pre style="white-space:pre-wrap;">${parsed.message}</pre>`;

  try {
    await sendEmail({ to: recipient, subject, html });
  } catch (error: any) {
    const message = error?.message || "Failed to send contact request";
    log("error", "contact_sales_email_failed", { error: message });
    return NextResponse.json({ error: `Message saved, but email could not be sent: ${message}` }, { status: 202 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
});
