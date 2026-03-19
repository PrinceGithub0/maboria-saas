-- Add pending provisioning status for platform-created identities.
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'PENDING';

-- Track forced password reset and soft-delete state for platform users.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "requirePasswordReset" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

