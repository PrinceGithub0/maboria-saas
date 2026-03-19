CREATE TABLE IF NOT EXISTS "impersonation_sessions" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "actorIp" TEXT,
  "actorUserAgent" TEXT,
  CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "impersonation_sessions_actorUserId_expiresAt_revokedAt_idx"
  ON "impersonation_sessions"("actorUserId", "expiresAt", "revokedAt");

CREATE INDEX IF NOT EXISTS "impersonation_sessions_targetUserId_tenantId_idx"
  ON "impersonation_sessions"("targetUserId", "tenantId");

ALTER TABLE "impersonation_sessions"
  ADD CONSTRAINT "impersonation_sessions_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "impersonation_sessions"
  ADD CONSTRAINT "impersonation_sessions_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "impersonation_sessions"
  ADD CONSTRAINT "impersonation_sessions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

