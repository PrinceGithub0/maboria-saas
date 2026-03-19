-- Automation errors console final hardening
-- Adds step timeline state columns and replay attempt audit table.

DO $$
BEGIN
  CREATE TYPE "AutomationStepStatus" AS ENUM ('STARTED', 'SUCCESS', 'FAILED', 'SKIPPED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AutomationReplayAttemptStatus" AS ENUM ('STARTED', 'BLOCKED', 'SUCCEEDED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AutomationStepExecution"
  ADD COLUMN IF NOT EXISTS "status" "AutomationStepStatus" NOT NULL DEFAULT 'STARTED',
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "durationMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "errorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "safeOutput" JSONB;

CREATE INDEX IF NOT EXISTS "AutomationStepExecution_runId_stepIndex_idx"
  ON "AutomationStepExecution"("runId", "stepIndex");

CREATE TABLE IF NOT EXISTS "AutomationReplayAttempt" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "newRunId" TEXT,
  "actorAdminId" TEXT NOT NULL,
  "actorIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resultStatus" "AutomationReplayAttemptStatus" NOT NULL,
  "blockReason" TEXT,
  "reason" TEXT,
  CONSTRAINT "AutomationReplayAttempt_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationReplayAttempt_runId_fkey'
  ) THEN
    ALTER TABLE "AutomationReplayAttempt"
      ADD CONSTRAINT "AutomationReplayAttempt_runId_fkey"
      FOREIGN KEY ("runId")
      REFERENCES "AutomationRun"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationReplayAttempt_newRunId_fkey'
  ) THEN
    ALTER TABLE "AutomationReplayAttempt"
      ADD CONSTRAINT "AutomationReplayAttempt_newRunId_fkey"
      FOREIGN KEY ("newRunId")
      REFERENCES "AutomationRun"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationReplayAttempt_actorAdminId_fkey'
  ) THEN
    ALTER TABLE "AutomationReplayAttempt"
      ADD CONSTRAINT "AutomationReplayAttempt_actorAdminId_fkey"
      FOREIGN KEY ("actorAdminId")
      REFERENCES "User"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AutomationReplayAttempt_runId_createdAt_idx"
  ON "AutomationReplayAttempt"("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationReplayAttempt_actorAdminId_createdAt_idx"
  ON "AutomationReplayAttempt"("actorAdminId", "createdAt");
