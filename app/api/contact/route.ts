import { NextResponse } from "next/server";
import { contactSalesSchema } from "@/lib/validators";
import { sendInfoMail } from "@/lib/email";
import { log } from "@/lib/logger";
import { withErrorHandling } from "@/lib/api-handler";
import { buildContactSalesEmail } from "@/emails/templates/contact-sales";
import { assertRateLimitAsync } from "@/lib/rate-limit";

export const POST = withErrorHandling(async (req: Request) => {
  const body = await req.json();
  const parsed = contactSalesSchema.parse(body);
  const email = parsed.email.trim().toLowerCase();
  const rawForwardedFor = req.headers.get("x-forwarded-for") || "";
  const ip = rawForwardedFor.split(",")[0]?.trim() || "unknown";

  await assertRateLimitAsync(`contact:ip:${ip}`, 5, 60_000);
  await assertRateLimitAsync(`contact:email:${email}`, 3, 10 * 60_000);

  const recipient =
    process.env.CONTACT_SALES_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    process.env.EMAIL_SUPPORT_FROM ||
    process.env.EMAIL_FROM ||
    "support@mail.maboria.com";
  const subject = `New enterprise inquiry: ${parsed.name}`;
  const { html, text } = buildContactSalesEmail(parsed);

  try {
    await sendInfoMail({ to: recipient, subject, html, text, replyTo: email });
  } catch (error: any) {
    const message = error?.message || "Failed to send contact request";
    log("error", "contact_sales_email_failed", { error: message });
    return NextResponse.json({ error: `Message saved, but email could not be sent: ${message}` }, { status: 202 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
});
