-- Team access hardening

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "orgId" TEXT,
  ADD COLUMN IF NOT EXISTS "actionType" TEXT,
  ADD COLUMN IF NOT EXISTS "targetUserId" TEXT;

CREATE INDEX IF NOT EXISTS "AuditLog_orgId_createdAt_idx"
  ON "AuditLog"("orgId", "createdAt");

ALTER TABLE "BusinessMember"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "invitedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3);

UPDATE "BusinessMember"
SET "role" = 'member'
WHERE LOWER(COALESCE("role", '')) IN ('agent', '');

UPDATE "BusinessMember"
SET "status" = 'active'
WHERE LOWER(COALESCE("status", '')) NOT IN ('active', 'invited', 'removed');

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "businessId", "userId"
      ORDER BY COALESCE("joinedAt", "createdAt") DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "BusinessMember"
)
DELETE FROM "BusinessMember" bm
USING ranked r
WHERE bm."id" = r."id"
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessMember_businessId_userId_key"
  ON "BusinessMember"("businessId", "userId");

CREATE INDEX IF NOT EXISTS "BusinessMember_businessId_role_status_idx"
  ON "BusinessMember"("businessId", "role", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessMember_one_owner_active_key"
  ON "BusinessMember"("businessId")
  WHERE LOWER("role") = 'owner' AND LOWER("status") = 'active';

ALTER TABLE "BusinessInvite"
  ADD COLUMN IF NOT EXISTS "tokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invitedByUserId" TEXT;

UPDATE "BusinessInvite"
SET "tokenHash" = "token"
WHERE "tokenHash" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessInvite_tokenHash_key"
  ON "BusinessInvite"("tokenHash")
  WHERE "tokenHash" IS NOT NULL;

UPDATE "BusinessInvite"
SET "role" = 'member'
WHERE LOWER(COALESCE("role", '')) IN ('agent', '');

ALTER TABLE "BusinessInvite"
  ALTER COLUMN "role" SET DEFAULT 'member';

ALTER TABLE "BusinessMember"
  ALTER COLUMN "role" SET DEFAULT 'member';
