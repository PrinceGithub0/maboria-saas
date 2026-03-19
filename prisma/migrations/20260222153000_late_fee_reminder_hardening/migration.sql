-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomerStatus') THEN
    CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'DISABLED');
  END IF;
END
$$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LateFeeType') THEN
    CREATE TYPE "LateFeeType" AS ENUM ('FIXED', 'PERCENTAGE');
  END IF;
END
$$;

-- AlterTable
ALTER TABLE "Customer"
ADD COLUMN IF NOT EXISTS "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Invoice"
ADD COLUMN IF NOT EXISTS "lateFeeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lateFeeAppliedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lateFeeLocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SubscriberSetting" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lateFeeEnabled" BOOLEAN NOT NULL DEFAULT false,
  "lateFeeType" "LateFeeType" NOT NULL DEFAULT 'FIXED',
  "lateFeeValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "lateFeeGraceDays" INTEGER NOT NULL DEFAULT 0,
  "lateFeeCap" DECIMAL(14,2),
  "lateFeeRecurring" BOOLEAN NOT NULL DEFAULT false,
  "lateFeeRecurringIntervalDays" INTEGER,
  "lateFeePolicyText" TEXT,
  "reminderCooldownMinutes" INTEGER NOT NULL DEFAULT 10,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubscriberSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReminderDispatch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReminderDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriberSetting_userId_key" ON "SubscriberSetting"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReminderDispatch_dedupeKey_key" ON "ReminderDispatch"("dedupeKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReminderDispatch_userId_invoiceId_createdAt_idx"
ON "ReminderDispatch"("userId", "invoiceId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SubscriberSetting_userId_fkey'
  ) THEN
    ALTER TABLE "SubscriberSetting"
    ADD CONSTRAINT "SubscriberSetting_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ReminderDispatch_userId_fkey'
  ) THEN
    ALTER TABLE "ReminderDispatch"
    ADD CONSTRAINT "ReminderDispatch_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ReminderDispatch_customerId_fkey'
  ) THEN
    ALTER TABLE "ReminderDispatch"
    ADD CONSTRAINT "ReminderDispatch_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ReminderDispatch_invoiceId_fkey'
  ) THEN
    ALTER TABLE "ReminderDispatch"
    ADD CONSTRAINT "ReminderDispatch_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
