DO $$
BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "AuthProvider" AS ENUM ('PASSWORD', 'GOOGLE', 'SSO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "authProvider" "AuthProvider" NOT NULL DEFAULT 'PASSWORD',
  ADD COLUMN IF NOT EXISTS "isPlatformUser" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

UPDATE "User"
SET "status" = 'DISABLED'
WHERE "role" = 'DISABLED';

UPDATE "User"
SET "isPlatformUser" = TRUE
WHERE "role" = 'ADMIN';

CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE INDEX IF NOT EXISTS "User_lastLoginAt_idx" ON "User"("lastLoginAt");
