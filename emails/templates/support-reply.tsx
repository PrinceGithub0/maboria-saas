import "server-only";

export type SupportReplyEmailProps = {
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
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/\[Ticket\s*#.*?\]/gi, "")
    .replace(/\[Ticket:.*?\]/gi, "")
    .replace(/\[TCK-.*?\]/gi, "")
    .replace(/\[Ref:\s*.*?\]/gi, "")
    .replace(/\s*(?:\\u2022|-)\s*Ref\s+[A-Za-z0-9_-]+\s*$/i, "")
    .replace(/^Re:\s*/i, "")
    .trim();
}

export function renderSupportReplyEmail(input: SupportReplyEmailProps) {
  const title = normalizeSupportTitle(input.ticketSubject) || "Support ticket";
  const helperText = "Reply to this email or continue the conversation in your Maboria support thread.";
  const supportAddress =
    process.env.EMAIL_SUPPORT_FROM ||
    process.env.SUPPORT_EMAIL ||
    process.env.PLATFORM_EMAIL_FROM ||
    "support@mail.maboria.com";
  const previewText = `Support Reply: ${title}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(title)}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .support-shell {
          padding: 20px 12px !important;
        }

        .support-card {
          border-radius: 16px !important;
        }

        .support-inner,
        .support-copy,
        .support-footer {
          padding-left: 20px !important;
          padding-right: 20px !important;
        }

        .support-title {
          font-size: 28px !important;
          line-height: 34px !important;
        }

        .support-message {
          padding: 20px !important;
        }

        .support-cta-wrap {
          padding-left: 20px !important;
          padding-right: 20px !important;
        }

        .support-cta {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
        }
      }

    </style>
  </head>
  <body class="support-body" style="margin:0;padding:0;background:#FFFFFF;font-family:Segoe UI,Arial,sans-serif;color:#0F172A;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(previewText)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" class="support-bg" style="width:100%;background:#FFFFFF;">
      <tr>
        <td align="center" class="support-shell" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FCFDFF" class="support-card" style="width:100%;max-width:600px;background:#FCFDFF;border-radius:20px;border:2px solid #AEBACE;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
                  <tr>
                    <td style="padding:0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FCFDFF" class="support-header" style="width:100%;background:#FCFDFF;border-radius:20px 20px 0 0;">
                        <tr>
                          <td class="support-inner" style="padding:24px 32px 20px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td class="support-brand" style="font-size:11px;line-height:16px;letter-spacing:0.26em;font-weight:800;text-transform:uppercase;color:#111827;">
                                  MABORIA
                                </td>
                                <td align="right" class="support-subtle" style="font-size:13px;line-height:18px;font-weight:600;color:#667085;">
                                  Support Reply
                                </td>
                              </tr>
                            </table>
                            <div class="support-accent-line" style="height:4px;width:100%;margin-top:18px;border-radius:999px;background:#7C8DFF;"></div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td class="support-copy" style="padding:26px 32px 0;">
                      <div class="support-kicker" style="display:inline-block;padding:7px 12px;border-radius:999px;background:#D6DEFF;color:#3E37C9;font-size:11px;line-height:11px;letter-spacing:0.16em;text-transform:uppercase;font-weight:800;">
                        Support Reply
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td class="support-copy" style="padding:16px 32px 0;">
                      <div class="support-title" style="font-size:34px;line-height:40px;font-weight:700;color:#111827;">
                        ${escapeHtml(title)}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td class="support-copy" style="padding:12px 32px 0;">
                      <div class="support-copy-text" style="font-size:16px;line-height:26px;color:#2F3B52;">
                        Our support team has replied to your ticket.
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td class="support-copy" style="padding:24px 32px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" class="support-message-card" style="width:100%;background:#FFFFFF;border:2px solid #CBD5E1;border-radius:18px;">
                        <tr>
                          <td class="support-message" style="padding:22px 22px 20px;font-size:16px;line-height:29px;color:#111827;">
                            ${formatMessageHtml(input.message)}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td class="support-copy" style="padding:18px 32px 0;">
                      <div class="support-ref-pill" style="display:inline-block;padding:8px 14px;border-radius:999px;background:#F4F7FF;border:1px solid #B7C4D8;font-size:12px;line-height:12px;color:#344054;font-weight:700;letter-spacing:0.01em;">
                        Ref: ${escapeHtml(input.ticketId)}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" class="support-cta-wrap" style="padding:30px 32px 0;">
                      <!--[if mso]>
                      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${escapeHtml(input.viewTicketUrl)}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="30%" strokecolor="#5B4CF0" fillcolor="#5B4CF0">
                        <w:anchorlock/>
                        <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:700;">
                          View Ticket
                        </center>
                      </v:roundrect>
                      <![endif]-->
                      <!--[if !mso]><!-- -->
                      <a href="${escapeHtml(input.viewTicketUrl)}" class="support-cta" style="display:inline-block;min-width:220px;height:48px;line-height:48px;border-radius:14px;background:#5B4CF0;background-image:linear-gradient(90deg,#6D4AFF 0%,#2563EB 100%);color:#FFFFFF !important;text-decoration:none;font-size:15px;font-weight:700;text-align:center;-webkit-text-size-adjust:none;mso-hide:all;">
                        <span style="color:#FFFFFF !important;text-decoration:none;display:block;">
                          <font color="#FFFFFF">View Ticket</font>
                        </span>
                      </a>
                      <!--<![endif]-->
                    </td>
                  </tr>
                  <tr>
                    <td class="support-copy" style="padding:20px 32px 0;">
                      <div class="support-subtle" style="font-size:13px;line-height:22px;color:#44526A;text-align:center;">
                        ${escapeHtml(helperText)}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td class="support-footer" style="padding:24px 32px 32px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="support-footer-rule" style="border-top:1px solid #C2CDDB;">
                        <tr>
                          <td style="padding-top:18px;">
                            <div class="support-brand" style="font-size:14px;line-height:22px;font-weight:700;color:#111827;">Maboria Support Team</div>
                            <div class="support-subtle" style="font-size:13px;line-height:22px;color:#44526A;">${escapeHtml(supportAddress)}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = [
    "Maboria Support Reply",
    "",
    title,
    `Ref: ${input.ticketId}`,
    "",
    input.message,
    "",
    "View Ticket:",
    input.viewTicketUrl,
    "",
    helperText,
    "",
    "Maboria Support Team",
    supportAddress,
  ].join("\n");

  return { html, text };
}

export const buildSupportReplyEmail = renderSupportReplyEmail;
