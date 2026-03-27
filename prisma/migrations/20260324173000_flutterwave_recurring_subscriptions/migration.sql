ALTER TABLE "OrgSubscription"
ADD COLUMN IF NOT EXISTS "providerPaymentMethodData" JSONB;
