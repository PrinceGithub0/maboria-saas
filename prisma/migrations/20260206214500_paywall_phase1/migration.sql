-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubscriptionStatus" ADD VALUE 'INCOMPLETE';
ALTER TYPE "SubscriptionStatus" ADD VALUE 'REVOKED';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "plan" "SubscriptionPlan" NOT NULL DEFAULT 'STARTER';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "currentPeriodStart" TIMESTAMP(3),
ADD COLUMN     "provider" "PaymentProvider";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT,
ADD COLUMN     "timeZone" TEXT;
