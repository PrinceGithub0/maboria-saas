import "server-only";

export type TeamInviteEmailProps = {
  workspaceName: string;
  recipientEmail: string;
  inviterName?: string | null;
  inviterEmail?: string | null;
  role: "member" | "admin" | "billing_admin";
  acceptUrl: string;
  mode: "signup" | "login";
};

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function roleLabel(role: TeamInviteEmailProps["role"]) {
  if (role === "billing_admin") return "Billing Admin";
  if (role === "admin") return "Admin";
  return "Member";
}

function modeLabel(mode: TeamInviteEmailProps["mode"]) {
  return mode === "login" ? "Sign in to accept" : "Create account or sign in";
}

export function buildTeamInviteSubject(input: TeamInviteEmailProps) {
  const workspace = input.workspaceName || "your workspace";
  const inviter = input.inviterName || input.inviterEmail || "A Maboria admin";
  return `${inviter} invited you to ${workspace} on Maboria`;
}

export function renderTeamInviteEmail(input: TeamInviteEmailProps) {
  const workspaceName = input.workspaceName || "Your workspace";
  const inviter = input.inviterName || input.inviterEmail || "A Maboria admin";
  const inviteRole = roleLabel(input.role);
  const nextStep = modeLabel(input.mode);
  const previewText = `${inviter} invited you to ${workspaceName} as ${inviteRole}.`;

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
    <title>${escapeHtml(workspaceName)}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .invite-shell {
          padding: 20px 14px !important;
        }

        .invite-title {
          font-size: 30px !important;
          line-height: 36px !important;
        }

        .invite-cta {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
        }

        .invite-meta td {
          display: block !important;
          width: 100% !important;
          padding-right: 0 !important;
          padding-left: 0 !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:Segoe UI,Arial,sans-serif;color:#10233d;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(previewText)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#ffffff;">
      <tr>
        <td align="center" class="invite-shell" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;">
            <tr>
              <td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                  <tr>
                    <td style="padding:0 0 24px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="font-size:11px;line-height:16px;letter-spacing:0.28em;font-weight:800;text-transform:uppercase;color:#5c6f86;">
                            MABORIA
                          </td>
                          <td align="right" style="font-size:12px;line-height:18px;font-weight:700;color:#5c6f86;">
                            Team Invitation
                          </td>
                        </tr>
                      </table>
                      <div style="margin-top:22px;display:inline-block;padding:8px 14px;border-radius:999px;background:#edf6ff;border:1px solid #cfe4f9;font-size:11px;line-height:11px;letter-spacing:0.16em;font-weight:800;text-transform:uppercase;color:#0f5f8f;">
                        ${escapeHtml(inviteRole)} Access
                      </div>
                      <div class="invite-title" style="margin-top:18px;font-size:40px;line-height:46px;font-weight:750;color:#10233d;">
                        Join ${escapeHtml(workspaceName)}
                      </div>
                      <div style="margin-top:14px;font-size:17px;line-height:29px;color:#4a627a;max-width:560px;">
                        ${escapeHtml(inviter)} invited you to collaborate in Maboria with ${escapeHtml(inviteRole)} access.
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 24px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="invite-meta" style="border-top:1px solid #d8e4ef;border-bottom:1px solid #d8e4ef;">
                        <tr>
                          <td style="width:50%;padding:18px 16px 18px 0;">
                            <div style="font-size:11px;line-height:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:800;color:#6b8196;">Workspace</div>
                            <div style="margin-top:10px;font-size:20px;line-height:28px;font-weight:700;color:#10233d;">${escapeHtml(workspaceName)}</div>
                          </td>
                          <td style="width:50%;padding:18px 0 18px 16px;">
                            <div style="font-size:11px;line-height:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:800;color:#6b8196;">Next step</div>
                            <div style="margin-top:10px;font-size:20px;line-height:28px;font-weight:700;color:#10233d;">${escapeHtml(nextStep)}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 28px;">
                      <div style="font-size:15px;line-height:28px;color:#4a627a;">
                        You are receiving this invitation at
                        <strong style="color:#10233d;"> ${escapeHtml(input.recipientEmail)}</strong>.
                        Accepting it gives you secure access to the workspace, shared operations, and the permissions attached to your role.
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td align="left" style="padding:0 0 28px;">
                      <!--[if mso]>
                      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${escapeHtml(input.acceptUrl)}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="14%" strokecolor="#10233d" fillcolor="#10233d">
                        <w:anchorlock/>
                        <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:700;">
                          Accept Invitation
                        </center>
                      </v:roundrect>
                      <![endif]-->
                      <!--[if !mso]><!-- -->
                      <a href="${escapeHtml(input.acceptUrl)}" class="invite-cta" style="display:inline-block;min-width:260px;height:52px;line-height:52px;border-radius:12px;background:#10233d;color:#ffffff !important;text-decoration:none;font-size:15px;font-weight:700;text-align:center;-webkit-text-size-adjust:none;mso-hide:all;">
                        <span style="color:#ffffff !important;text-decoration:none;display:block;">
                          <font color="#ffffff">Accept Invitation</font>
                        </span>
                      </a>
                      <!--<![endif]-->
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 24px;">
                      <div style="font-size:13px;line-height:22px;color:#667b91;">
                        This secure invitation expires in 7 days and can only be used once.
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #d8e4ef;">
                        <tr>
                          <td style="padding-top:18px;font-size:13px;line-height:23px;color:#667b91;">
                            Prefer to copy the link directly?<br />
                            <a href="${escapeHtml(input.acceptUrl)}" style="color:#0d6e8c;text-decoration:none;word-break:break-all;">${escapeHtml(input.acceptUrl)}</a>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-top:18px;font-size:14px;line-height:22px;font-weight:700;color:#10233d;">
                            Maboria
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
    "Maboria Team Invitation",
    "",
    `${inviter} invited you to join ${workspaceName}.`,
    `Role: ${inviteRole}`,
    `Sent to: ${input.recipientEmail}`,
    `Next step: ${nextStep}`,
    "",
    "Accept invitation:",
    input.acceptUrl,
    "",
    "This secure invitation expires in 7 days and can only be used once.",
  ].join("\n");

  return { html, text };
}
