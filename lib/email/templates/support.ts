import "server-only";

type BuildSupportReplyEmailInput = {
  ticketId: string;
  ticketSubject: string;
  message: string;
  viewTicketUrl: string;
};

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMessageHtml(message: string) {
  return escapeHtml(message).replace(/\r\n|\r|\n/g, "<br/>");
}

function normalizeSupportTitle(title: string) {
  return String(title || "")
    .replace(/\[Ticket\s*#.*?\]/gi, "")
    .replace(/\[Ticket:.*?\]/gi, "")
    .replace(/\[TCK-.*?\]/gi, "")
    .replace(/\[Ref:\s*.*?\]/gi, "")
    .replace(/\s*[•-]\s*Ref\s+[A-Za-z0-9_-]+\s*$/i, "")
    .replace(/^Re:\s*/i, "")
    .trim();
}

function baseSupportEmailLayout(input: {
  eyebrow: string;
  title: string;
  intro: string;
  bodyHtml: string;
  referenceLabel: string;
  referenceValue: string;
  ctaLabel: string;
  ctaUrl: string;
  helperText: string;
}) {
  const supportAddress =
    process.env.EMAIL_SUPPORT_FROM ||
    process.env.SUPPORT_EMAIL ||
    process.env.PLATFORM_EMAIL_FROM ||
    "support@mail.maboria.com";
  const previewText = `${input.eyebrow}: ${input.title}`;

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <title>${escapeHtml(input.title)}</title>
    </head>
    <body style="margin:0;padding:0;background:#edf2f7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        ${escapeHtml(previewText)}
      </div>
      <div style="width:100%;background:#edf2f7;padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;">
          <tr>
            <td style="padding:0 8px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size:13px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#4f46e5;">
                    Maboria
                  </td>
                  <td align="right" style="font-size:12px;line-height:1.6;color:#64748b;">
                    Support Desk
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f172a;border:1px solid #1e293b;border-radius:28px;overflow:hidden;box-shadow:0 24px 56px rgba(15,23,42,0.22);">
                <tr>
                  <td style="height:6px;background:linear-gradient(90deg,#4f46e5 0%,#2563eb 100%);font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:40px 40px 14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td>
                          <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:18px;font-size:30px;line-height:1.18;font-weight:700;color:#f8fafc;">
                          ${escapeHtml(input.title)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:12px;font-size:16px;line-height:1.8;color:#cbd5e1;">
                          ${escapeHtml(input.intro)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 40px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #334155;border-radius:22px;background:#111c31;">
                      <tr>
                        <td style="padding:24px 26px 22px;font-size:15px;line-height:1.9;color:#f8fafc;">
                          ${input.bodyHtml}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:30px 40px 0;">
                    <div style="height:1px;background:#334155;"></div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:22px 40px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;">
                          ${escapeHtml(input.referenceLabel)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:10px;">
                          <div style="display:inline-block;padding:8px 12px;border-radius:999px;background:#162338;border:1px solid #334155;font-size:13px;font-weight:600;color:#cbd5e1;">
                            ${escapeHtml(input.referenceValue)}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 40px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#111c31;border:1px solid #334155;border-radius:22px;">
                      <tr>
                        <td style="padding:24px 24px 26px;text-align:center;">
                          <div style="font-size:14px;line-height:1.8;color:#cbd5e1;padding-bottom:18px;">
                            Open your support thread to continue the conversation and review the latest update.
                          </div>
                          <a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:#4f46e5;border-radius:14px;padding:16px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;line-height:1;box-shadow:0 10px 22px rgba(79,70,229,0.24);">
                            ${escapeHtml(input.ctaLabel)}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 40px 0;">
                    <p style="margin:0;font-size:13px;line-height:1.7;color:#94a3b8;text-align:center;">
                      ${escapeHtml(input.helperText)}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 40px 40px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #334155;">
                      <tr>
                        <td style="padding-top:22px;">
                          <div style="font-size:14px;font-weight:700;color:#f8fafc;">Maboria Support Team</div>
                          <div style="margin-top:6px;font-size:13px;line-height:1.75;color:#94a3b8;">
                            ${escapeHtml(supportAddress)}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    </body>
  </html>
  `.trim();
}

export function buildSupportReplyEmail(input: BuildSupportReplyEmailInput) {
  const helperText = "Reply to this email or continue the conversation in your Maboria support thread.";
  const title = normalizeSupportTitle(input.ticketSubject) || "Support ticket";
  const intro = "Our support team has replied to your ticket.";
  const html = baseSupportEmailLayout({
    eyebrow: "Support Reply",
    title,
    intro,
    bodyHtml: formatMessageHtml(input.message),
    referenceLabel: "Ticket Reference",
    referenceValue: input.ticketId,
    ctaLabel: "View Ticket",
    ctaUrl: input.viewTicketUrl,
    helperText,
  });

  const text = [
    "Maboria Support Reply",
    "",
    title,
    `Reference: ${input.ticketId}`,
    "",
    input.message,
    "",
    "View Ticket:",
    input.viewTicketUrl,
    "",
    helperText,
    "",
    "Maboria Support Team",
  ].join("\n");

  return { html, text };
}
