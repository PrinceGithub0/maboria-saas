import { compare, genSalt, hash } from "bcryptjs";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { prisma } from "./prisma";
import { verifyTotp } from "./totp";
import { assertRateLimit } from "./rate-limit";
import { safeDecryptSecret } from "./crypto";

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

export async function hashPassword(password: string) {
  const salt = await genSalt(10);
  return hash(password, salt);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
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
        const rawForwardedFor =
          // NextRequest (App Router)
          (req as any)?.headers?.get?.("x-forwarded-for") ||
          // Node request (fallback)
          (req as any)?.headers?.["x-forwarded-for"] ||
          "";
        const ip = String(rawForwardedFor).split(",")[0]?.trim() || "unknown";

        // Basic abuse prevention. Keep limits strict for auth + 2FA attempts.
        assertRateLimit(`auth:login:ip:${ip}`, 30, 60_000);
        assertRateLimit(`auth:login:email:${email}`, 10, 60_000);

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          return null;
        }

        const valid = await verifyPassword(
          credentials.password,
          user.passwordHash
        );

        if (!valid) {
          return null;
        }

        // If TOTP 2FA is enabled, require either a valid 6-digit code or an unused backup code.
        if (user.twoFactorEnabled) {
          assertRateLimit(`auth:2fa:email:${email}`, 5, 60_000);
          const otp = (credentials as any)?.otp as string | undefined;
          if (!otp) return null;

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

          if (!verified) return null;
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
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) || "USER";
      }
      return session;
    },
  },
  events: {
    async signIn(message) {
      await prisma.activityLog.create({
        data: {
          userId: (message.user as any)?.id,
          action: "USER_SIGNIN",
          metadata: {
            provider: message.account?.provider,
          },
        },
      });
    },
  },
};
