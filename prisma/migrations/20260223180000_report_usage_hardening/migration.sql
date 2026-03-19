-- Usage + report hardening schema

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UsageFeatureKey') THEN
    CREATE TYPE "UsageFeatureKey" AS ENUM (
      'AI_REQUESTS',
      'INVOICES',
      'WHATSAPP_MESSAGES',
      'AUTOMATIONS_RUNS',
      'TEAM_MEMBERS_SEATS'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UsageEventSource') THEN
    CREATE TYPE "UsageEventSource" AS ENUM ('APP', 'SYSTEM', 'WEBHOOK', 'BACKFILL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrgSubscriptionStatus') THEN
    CREATE TYPE "OrgSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrgBillingInterval') THEN
    CREATE TYPE "OrgBillingInterval" AS ENUM ('MONTHLY', 'YEARLY');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "UsageEvent" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "userId" TEXT,
  "featureKey" "UsageFeatureKey" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "cycleKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "source" "UsageEventSource" NOT NULL DEFAULT 'APP',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UsageDailyRollup" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "featureKey" "UsageFeatureKey" NOT NULL,
  "day" TIMESTAMP(3) NOT NULL,
  "cycleKey" TEXT NOT NULL,
  "totalQuantity" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageDailyRollup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UsageCycleTotal" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "featureKey" "UsageFeatureKey" NOT NULL,
  "cycleKey" TEXT NOT NULL,
  "usedQuantity" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageCycleTotal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrgSubscription" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "planId" "SubscriptionPlan" NOT NULL,
  "status" "OrgSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "billingInterval" "OrgBillingInterval" NOT NULL DEFAULT 'MONTHLY',
  "provider" "PaymentProvider",
  "providerCustomerId" TEXT,
  "providerSubscriptionId" TEXT,
  "paidThroughAt" TIMESTAMP(3),
  "usageCycleAnchorDay" INTEGER NOT NULL,
  "activationTimestamp" TIMESTAMP(3) NOT NULL,
  "currentCycleStartAt" TIMESTAMP(3) NOT NULL,
  "currentCycleEndAt" TIMESTAMP(3) NOT NULL,
  "apiAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrgSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UsageEvent_orgId_idempotencyKey_key"
  ON "UsageEvent"("orgId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "UsageEvent_orgId_occurredAt_idx"
  ON "UsageEvent"("orgId", "occurredAt");
CREATE INDEX IF NOT EXISTS "UsageEvent_orgId_cycleKey_idx"
  ON "UsageEvent"("orgId", "cycleKey");
CREATE INDEX IF NOT EXISTS "UsageEvent_orgId_featureKey_idx"
  ON "UsageEvent"("orgId", "featureKey");

CREATE UNIQUE INDEX IF NOT EXISTS "UsageDailyRollup_orgId_featureKey_day_cycleKey_key"
  ON "UsageDailyRollup"("orgId", "featureKey", "day", "cycleKey");
CREATE INDEX IF NOT EXISTS "UsageDailyRollup_orgId_cycleKey_day_idx"
  ON "UsageDailyRollup"("orgId", "cycleKey", "day");

CREATE UNIQUE INDEX IF NOT EXISTS "UsageCycleTotal_orgId_featureKey_cycleKey_key"
  ON "UsageCycleTotal"("orgId", "featureKey", "cycleKey");
CREATE INDEX IF NOT EXISTS "UsageCycleTotal_orgId_cycleKey_idx"
  ON "UsageCycleTotal"("orgId", "cycleKey");

CREATE UNIQUE INDEX IF NOT EXISTS "OrgSubscription_orgId_key"
  ON "OrgSubscription"("orgId");
CREATE INDEX IF NOT EXISTS "OrgSubscription_status_idx"
  ON "OrgSubscription"("status");
CREATE INDEX IF NOT EXISTS "OrgSubscription_currentCycleEndAt_idx"
  ON "OrgSubscription"("currentCycleEndAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UsageEvent_orgId_fkey'
  ) THEN
    ALTER TABLE "UsageEvent"
      ADD CONSTRAINT "UsageEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UsageEvent_userId_fkey'
  ) THEN
    ALTER TABLE "UsageEvent"
      ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UsageDailyRollup_orgId_fkey'
  ) THEN
    ALTER TABLE "UsageDailyRollup"
      ADD CONSTRAINT "UsageDailyRollup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UsageCycleTotal_orgId_fkey'
  ) THEN
    ALTER TABLE "UsageCycleTotal"
      ADD CONSTRAINT "UsageCycleTotal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrgSubscription_orgId_fkey'
  ) THEN
    ALTER TABLE "OrgSubscription"
      ADD CONSTRAINT "OrgSubscription_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

