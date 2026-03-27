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
  const previewText = `${input.name} reached out through the enterprise contact form.`;

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

        .card {
          border-radius: 18px !important;
        }

        .inner {
          padding-left: 20px !important;
          padding-right: 20px !important;
        }

        .title {
          font-size: 28px !important;
          line-height: 34px !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f6f8fc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(previewText)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f6f8fc;">
      <tr>
        <td align="center" class="shell" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;">
            <tr>
              <td class="inner" style="padding:0 6px 16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                  <tr>
                    <td style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#4f46e5;">
                      Maboria
                    </td>
                    <td align="right" style="font-size:12px;line-height:18px;color:#64748b;">
                      Enterprise Lead
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card" style="width:100%;background:#ffffff;border:1px solid #dbe3f0;border-radius:24px;box-shadow:0 18px 40px rgba(15,23,42,0.07);">
                  <tr>
                    <td style="height:4px;background:linear-gradient(90deg,#4f46e5 0%,#2563eb 100%);font-size:0;line-height:0;border-radius:24px 24px 0 0;">&nbsp;</td>
                  </tr>
                  <tr>
                    <td class="inner" style="padding:34px 32px 12px;">
                      <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:11px;line-height:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">
                        Contact Sales
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td class="inner title" style="padding:0 32px;font-size:32px;line-height:38px;font-weight:700;color:#0f172a;">
                      ${escapeHtml(title)}
                    </td>
                  </tr>
                  <tr>
                    <td class="inner" style="padding:12px 32px 0;font-size:15px;line-height:24px;color:#475569;">
                      A new enterprise lead came in through the public contact form. Reply directly to this email to continue the conversation.
                    </td>
                  </tr>
                  <tr>
                    <td class="inner" style="padding:24px 32px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #dbe3f0;border-radius:18px;background:#fbfcfe;">
                        <tr>
                          <td style="padding:20px 22px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                              <tr>
                                <td style="padding:0 0 12px;font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">Name</td>
                                <td style="padding:0 0 12px;font-size:15px;line-height:22px;font-weight:600;color:#0f172a;" align="right">${escapeHtml(formatLine(input.name))}</td>
                              </tr>
                              <tr>
                                <td style="padding:12px 0;font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;border-top:1px solid #dbe3f0;">Email</td>
                                <td style="padding:12px 0;font-size:15px;line-height:22px;font-weight:600;color:#0f172a;border-top:1px solid #dbe3f0;" align="right">${escapeHtml(formatLine(input.email))}</td>
                              </tr>
                              <tr>
                                <td style="padding:12px 0 0;font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;border-top:1px solid #dbe3f0;">Company</td>
                                <td style="padding:12px 0 0;font-size:15px;line-height:22px;font-weight:600;color:#0f172a;border-top:1px solid #dbe3f0;" align="right">${escapeHtml(formatLine(input.company))}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td class="inner" style="padding:24px 32px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #dbe3f0;border-radius:18px;background:#ffffff;">
                        <tr>
                          <td style="padding:18px 22px 10px;font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">
                            Message
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:0 22px 22px;font-size:15px;line-height:26px;color:#0f172a;">
                            ${formatMultilineHtml(input.message)}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td class="inner" style="padding:26px 32px 0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #e2e8f0;">
                        <tr>
                          <td style="padding-top:18px;font-size:13px;line-height:22px;color:#64748b;">
                            Sent to ${escapeHtml(inboxAddress)} through Maboria contact sales routing.
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td class="inner" style="padding:10px 32px 32px;font-size:13px;line-height:22px;color:#475569;">
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
