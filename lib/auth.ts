import { compare, genSalt, hash } from "bcryptjs";
import Credentials from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { prisma } from "./prisma";
import { verifyTotp } from "./totp";
import { assertRateLimit } from "./rate-limit";
import { safeDecryptSecret } from "./crypto";
import { isPlatformRole } from "./global-role";
import { logUserActivity } from "./user-activity";
import { emitSystemEvent } from "./system-events";

type StoredBackupCode = { hash: string; usedAt: string | null };

function normalizeBackupCodes(value: unknown): StoredBackupCode[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const hash = (c as any).hash;
      const usedAt = (c as any).usedAt ?? null;
      if (typeof hash !== "string") return null;
      if (usedAt !== null && typeof usedAt !== "string") return null;
      return { hash, usedAt };
    })
    .filter(Boolean) as StoredBackupCode[];
}

function orgRoleRank(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "owner") return 3;
  if (normalized === "admin") return 2;
  return 1;
}

async function getPrimaryBusinessAccessStatus(userId: string) {
  const memberships = await prisma.businessMember.findMany({
    where: { userId, status: "active" },
    include: {
      business: {
        select: {
          accessStatus: true,
        },
      },
    },
  });

  if (!memberships.length) return null;

  const primary = memberships
    .slice()
    .sort((a, b) => {
      const roleDelta = orgRoleRank(b.role) - orgRoleRank(a.role);
      if (roleDelta !== 0) return roleDelta;
      return a.createdAt.getTime() - b.createdAt.getTime();
    })[0];

  return primary?.business?.accessStatus ?? null;
}

export async function hashPassword(password: string) {
  const salt = await genSalt(10);
  return hash(password, salt);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NEXTAUTH_DEBUG === "true",
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        otp: { label: "2FA code", type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        const email = credentials.email.toLowerCase().trim();
        const recordLoginFailure = async (reason: string, userId?: string | null) => {
          await emitSystemEvent({
            userId: userId || null,
            actorId: userId || null,
            eventType: "user_login_failed",
            severity: "WARNING",
            source: "AUTH",
            entityType: "user",
            entityId: userId || null,
            message: "User login failed.",
            metadata: {
              email,
              reason,
            },
          });
        };
        const rawForwardedFor =
          // NextRequest (App Router)
          (req as any)?.headers?.get?.("x-forwarded-for") ||
          // Node request (fallback)
          (req as any)?.headers?.["x-forwarded-for"] ||
          "";
        const ip = String(rawForwardedFor).split(",")[0]?.trim() || "unknown";

        // Basic abuse prevention. Keep limits strict for auth + 2FA attempts.
        // Do not throw from NextAuth authorize (keeps auth flow stable); treat as failed signin.
        try {
          assertRateLimit(`auth:login:ip:${ip}`, 30, 60_000);
          assertRateLimit(`auth:login:email:${email}`, 10, 60_000);
        } catch {
          await recordLoginFailure("rate_limited");
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          await recordLoginFailure("user_not_found");
          return null;
        }

        const valid = await verifyPassword(
          credentials.password,
          user.passwordHash
        );

        if (!valid) {
          await recordLoginFailure("invalid_password", user.id);
          return null;
        }
        if (String((user as any).status || "ACTIVE").toUpperCase() !== "ACTIVE") {
          await recordLoginFailure("inactive_user", user.id);
          return null;
        }

        // If TOTP 2FA is enabled, require either a valid 6-digit code or an unused backup code.
        if (user.twoFactorEnabled) {
          try {
            assertRateLimit(`auth:2fa:email:${email}`, 5, 60_000);
          } catch {
            await recordLoginFailure("2fa_rate_limited", user.id);
            return null;
          }
          const otp = (credentials as any)?.otp as string | undefined;
          if (!otp) {
            await recordLoginFailure("2fa_missing", user.id);
            return null;
          }

          const trimmed = otp.trim();
          let verified = false;

          const secret = safeDecryptSecret(user.twoFactorSecret);
          if (secret && /^\d{6}$/.test(trimmed.replace(/\s+/g, ""))) {
            verified = verifyTotp({ secret, token: trimmed });
          }

          if (!verified) {
            const stored = normalizeBackupCodes(user.twoFactorBackupCodes);
            for (let i = 0; i < stored.length; i++) {
              const entry = stored[i];
              if (entry.usedAt) continue;
              const ok = await verifyPassword(trimmed, entry.hash);
              if (ok) {
                stored[i] = { ...entry, usedAt: new Date().toISOString() };
                await prisma.user.update({
                  where: { id: user.id },
                  data: { twoFactorBackupCodes: stored as any },
                });
                verified = true;
                break;
              }
            }
          }

          if (!verified) {
            await recordLoginFailure("2fa_invalid", user.id);
            return null;
          }
        }

        if (!isPlatformRole(user.role)) {
          const accessStatus = await getPrimaryBusinessAccessStatus(user.id);
          if (accessStatus && accessStatus !== "ACTIVE") {
            await recordLoginFailure("tenant_access_inactive", user.id);
            return null;
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role ?? "USER";
        token.id = (user as any).id;
      }
      const tokenUserId = typeof token.id === "string" ? token.id : "";
      if (tokenUserId) {
        const currentUser = await prisma.user.findUnique({
          where: { id: tokenUserId },
          select: { status: true, role: true },
        });
        if (!currentUser || String(currentUser.status || "ACTIVE").toUpperCase() !== "ACTIVE") {
          delete (token as any).id;
          token.role = "USER";
          (token as any).inactive = true;
          return token;
        }
        token.role = currentUser.role || (token.role as string) || "USER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (typeof token.id === "string" ? token.id : "") as string;
        session.user.role = (token.role as string) || "USER";
      }
      return session;
    },
  },
  events: {
    async signIn(message) {
      const userId = (message.user as any)?.id as string | undefined;
      if (!userId) return;

      const provider = String(message.account?.provider || "credentials").toLowerCase();
      const authProvider =
        provider === "google"
          ? "GOOGLE"
          : provider === "credentials"
            ? "PASSWORD"
            : "SSO";

      await prisma.user.update({
        where: { id: userId },
        data: {
          lastLoginAt: new Date(),
          authProvider: authProvider as any,
        },
      });

      await prisma.activityLog.create({
        data: {
          userId,
          action: "USER_SIGNIN",
          metadata: {
            provider: message.account?.provider,
          },
        },
      });

      await logUserActivity({
        userId,
        actorId: userId,
        eventType: "login",
        metadata: {
          provider: message.account?.provider || "credentials",
        },
      });
      await emitSystemEvent({
        userId,
        actorId: userId,
        eventType: "user_login_success",
        severity: "INFO",
        source: "AUTH",
        entityType: "user",
        entityId: userId,
        message: "User login succeeded.",
        metadata: {
          provider: message.account?.provider || "credentials",
        },
      });
    },
    async signOut(message) {
      const userId =
        ((message as any)?.token?.id as string | undefined) ||
        ((message as any)?.session?.user?.id as string | undefined);
      if (!userId) return;
      await prisma.activityLog.create({
        data: {
          userId,
          action: "USER_SIGNOUT",
        },
      });

      await logUserActivity({
        userId,
        actorId: userId,
        eventType: "logout",
      });
    },
  },
};
