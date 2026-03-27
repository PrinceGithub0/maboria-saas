import "server-only";

type ContactSalesEmailInput = {
  name: string;
  email: string;
  company?: string | null;
  message: string;
};

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMultilineHtml(value: string) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br/>");
}

function formatLine(value?: string | null) {
  const normalized = String(value || "").trim();
  return normalized ? normalized : "-";
}

export function buildContactSalesEmail(input: ContactSalesEmailInput) {
  const inboxAddress =
    process.env.CONTACT_SALES_EMAIL ||
    process.env.EMAIL_INFO_FROM ||
    process.env.PLATFORM_EMAIL_FROM ||
    "info@maboria.com";
  const title = `New enterprise inquiry from ${input.name}`;
  const previewText = `${input.name} reached out through the Maboria enterprise contact form.`;

  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(title)}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .shell {
          padding: 20px 12px !important;
        }

        .inner {
          padding-left: 20px !important;
          padding-right: 20px !important;
        }

        .title {
          font-size: 28px !important;
          line-height: 34px !important;
        }

        .meta-label,
        .meta-value {
          display: block !important;
          width: 100% !important;
          text-align: left !important;
        }

        .meta-value {
          padding-top: 6px !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f7f8fb;font-family:Georgia,'Times New Roman',serif;color:#172033;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(previewText)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f7f8fb;">
      <tr>
        <td align="center" class="shell" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;">
            <tr>
              <td class="inner" style="padding:0 6px 18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                  <tr>
                    <td style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#3f51d1;">
                      Maboria
                    </td>
                    <td align="right" style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">
                      Contact Sales
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border-top:1px solid #d5dbe6;border-bottom:1px solid #d5dbe6;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                  <tr>
                    <td class="inner title" style="padding:34px 32px 0;font-size:36px;line-height:42px;font-weight:400;color:#172033;">
                      ${escapeHtml(title)}
                    </td>
                  </tr>
                  <tr>
                    <td class="inner" style="padding:14px 32px 0;font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:25px;color:#4b5563;">
                      A new enterprise lead came in through the public contact form. Reply directly to this email to continue the conversation.
                    </td>
                  </tr>
                  <tr>
                    <td class="inner" style="padding:28px 32px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #e4e8ef;">
                        <tr>
                          <td class="meta-label" style="padding:16px 0 14px;vertical-align:top;font-family:Segoe UI,Arial,sans-serif;font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;">
                            Name
                          </td>
                          <td class="meta-value" align="right" style="padding:16px 0 14px;vertical-align:top;text-align:right;font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:22px;font-weight:500;color:#172033;word-break:break-word;overflow-wrap:anywhere;max-width:360px;">
                            ${escapeHtml(formatLine(input.name))}
                          </td>
                        </tr>
                        <tr>
                          <td class="meta-label" style="padding:14px 0;vertical-align:top;border-top:1px solid #e4e8ef;font-family:Segoe UI,Arial,sans-serif;font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;">
                            Email
                          </td>
                          <td class="meta-value" align="right" style="padding:14px 0;vertical-align:top;text-align:right;border-top:1px solid #e4e8ef;font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:22px;font-weight:500;color:#172033;word-break:break-word;overflow-wrap:anywhere;max-width:360px;">
                            ${escapeHtml(formatLine(input.email))}
                          </td>
                        </tr>
                        <tr>
                          <td class="meta-label" style="padding:14px 0;vertical-align:top;border-top:1px solid #e4e8ef;font-family:Segoe UI,Arial,sans-serif;font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;">
                            Company
                          </td>
                          <td class="meta-value" align="right" style="padding:14px 0;vertical-align:top;text-align:right;border-top:1px solid #e4e8ef;font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:22px;font-weight:500;color:#172033;word-break:break-word;overflow-wrap:anywhere;max-width:360px;">
                            ${escapeHtml(formatLine(input.company))}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td class="inner" style="padding:30px 32px 0;font-family:Segoe UI,Arial,sans-serif;font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;">
                      Message
                    </td>
                  </tr>
                  <tr>
                    <td class="inner" style="padding:14px 32px 0;font-size:18px;line-height:33px;color:#172033;">
                      ${formatMultilineHtml(input.message)}
                    </td>
                  </tr>
                  <tr>
                    <td class="inner" style="padding:32px 32px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #e4e8ef;">
                        <tr>
                          <td style="padding:18px 0 0;font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:22px;color:#6b7280;">
                            Delivered to ${escapeHtml(inboxAddress)} through Maboria contact sales routing.
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:8px 0 34px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:22px;color:#4b5563;">
                            Reply directly to this email to answer ${escapeHtml(input.name)}.
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
    "Maboria Contact Sales",
    "",
    title,
    "",
    `Name: ${formatLine(input.name)}`,
    `Email: ${formatLine(input.email)}`,
    `Company: ${formatLine(input.company)}`,
    "",
    "Message:",
    input.message,
    "",
    `Delivered to ${inboxAddress} via Maboria contact sales routing.`,
  ].join("\n");

  return { html, text };
}
