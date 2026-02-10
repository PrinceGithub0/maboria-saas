-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('CREATED', 'REDIRECTED', 'SUCCESS', 'FAILED', 'ABANDONED');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "pendingEffectiveAt" TIMESTAMP(3),
ADD COLUMN     "pendingPlan" "SubscriptionPlan";

-- CreateTable
CREATE TABLE "CheckoutSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'CREATED',
    "providerPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_reference_key" ON "CheckoutSession"("reference");

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
