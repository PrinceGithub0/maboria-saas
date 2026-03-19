-- Create business access status enum
CREATE TYPE "BusinessAccessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- Add tenant access control columns
ALTER TABLE "Business"
  ADD COLUMN "accessStatus" "BusinessAccessStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedReason" TEXT;

CREATE INDEX "Business_accessStatus_createdAt_idx"
  ON "Business"("accessStatus", "createdAt");
