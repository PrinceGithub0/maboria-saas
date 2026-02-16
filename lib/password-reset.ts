import crypto from "crypto";

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function getTokenPepper() {
  return process.env.RESET_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || "";
}

export function normalizeEmailAddress(email: string) {
  return email.toLowerCase().trim();
}

export function hashPasswordResetToken(rawToken: string) {
  return crypto
    .createHash("sha256")
    .update(`${rawToken.trim()}:${getTokenPepper()}`)
    .digest("hex");
}

export function generatePasswordResetToken() {
  const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("base64url");
  return {
    rawToken,
    hashedToken: hashPasswordResetToken(rawToken),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  };
}

export function resolveAppBaseUrl(req: Request) {
  const origin = req.headers.get("origin");
  return (
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    origin ||
    new URL(req.url).origin
  );
}

export function maskEmailForLogs(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  if (local.length <= 2) return `${local[0] ?? "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

export function buildPasswordResetEmailHtml({
  resetUrl,
  logoUrl,
}: {
  resetUrl: string;
  logoUrl: string;
}) {
  return `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:28px">
      <img src="${logoUrl}" alt="Maboria" width="40" height="40" style="display:block;border-radius:8px" />
      <h1 style="margin:18px 0 8px;font-size:22px;line-height:1.2;font-weight:600;color:#0f172a">Password Reset Request</h1>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155">
        We received a request to reset your password. If this was you, click the button below.
      </p>
      <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 16px;border-radius:10px">
        Reset password
      </a>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#475569">This link expires in 30 minutes.</p>
      <p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#64748b">
        If you did not request this, you can safely ignore this email.
      </p>
    </div>
  </div>
  `.trim();
}

export function buildPasswordUpdatedEmailHtml({ logoUrl }: { logoUrl: string }) {
  return `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:28px">
      <img src="${logoUrl}" alt="Maboria" width="40" height="40" style="display:block;border-radius:8px" />
      <h1 style="margin:18px 0 8px;font-size:22px;line-height:1.2;font-weight:600;color:#0f172a">Password updated</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#334155">
        Your password was updated successfully. If this was not you, contact support immediately.
      </p>
    </div>
  </div>
  `.trim();
}
