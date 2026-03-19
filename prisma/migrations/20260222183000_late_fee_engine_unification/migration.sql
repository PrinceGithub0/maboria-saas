-- Add unified late fee settings fields (keep legacy fields for compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'LateFeeMode'
  ) THEN
    CREATE TYPE "LateFeeMode" AS ENUM ('ONE_TIME', 'RECURRING');
  END IF;
END $$;

ALTER TABLE "SubscriberSetting"
ADD COLUMN IF NOT EXISTS "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lateFeeMode" "LateFeeMode" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN IF NOT EXISTS "lateFeeIntervalDays" INTEGER,
ADD COLUMN IF NOT EXISTS "allowAutomationLateFee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "maxLateFeeApplications" INTEGER;

UPDATE "SubscriberSetting"
SET
  "gracePeriodDays" = COALESCE("lateFeeGraceDays", "gracePeriodDays", 0),
  "lateFeeMode" = CASE WHEN COALESCE("lateFeeRecurring", false) = true THEN 'RECURRING'::"LateFeeMode" ELSE 'ONE_TIME'::"LateFeeMode" END,
  "lateFeeIntervalDays" = CASE
    WHEN COALESCE("lateFeeRecurring", false) = true
      THEN COALESCE("lateFeeRecurringIntervalDays", "lateFeeIntervalDays", 1)
    ELSE NULL
  END;

-- Add invoice accumulation fields
ALTER TABLE "Invoice"
ADD COLUMN IF NOT EXISTS "lateFeeTotalAccumulated" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lateFeeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lastLateFeeAppliedAt" TIMESTAMP(3);

UPDATE "Invoice"
SET
  "lateFeeTotalAccumulated" = COALESCE("lateFeeAmount", 0),
  "lateFeeCount" = CASE WHEN COALESCE("lateFeeAmount", 0) > 0 THEN 1 ELSE 0 END,
  "lastLateFeeAppliedAt" = COALESCE("lateFeeAppliedAt", "lastLateFeeAppliedAt");
