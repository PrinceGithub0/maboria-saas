CREATE TABLE IF NOT EXISTS "AdminStepUpToken" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actionHash" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminStepUpToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminStepUpToken_tokenHash_key" ON "AdminStepUpToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "AdminStepUpToken_actorUserId_expiresAt_idx" ON "AdminStepUpToken"("actorUserId", "expiresAt");

ALTER TABLE "AdminStepUpToken"
  ADD CONSTRAINT "AdminStepUpToken_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

