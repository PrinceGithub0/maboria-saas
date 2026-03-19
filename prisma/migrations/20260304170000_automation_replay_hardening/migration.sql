-- Automation replay/recovery hardening
-- Adds recovery status, error diagnostics, idempotent step execution, and safety indexes.

DO $$
BEGIN
  CREATE TYPE "AutomationRecoveryStatus" AS ENUM ('FAILED', 'RETRYING', 'RESOLVED', 'REPLAYED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AutomationRun"
  ADD COLUMN IF NOT EXISTS "recoveryStatus" "AutomationRecoveryStatus",
  ADD COLUMN IF NOT EXISTS "last_retry_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "original_run_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AutomationRun_original_run_id_fkey'
  ) THEN
    ALTER TABLE "AutomationRun"
      ADD CONSTRAINT "AutomationRun_original_run_id_fkey"
      FOREIGN KEY ("original_run_id")
      REFERENCES "AutomationRun"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AutomationRunError" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "flowId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stepId" TEXT,
  "stepIndex" INTEGER,
  "errorType" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stackTrace" TEXT,
  "transient" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationRunError_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AutomationRunError_runId_fkey'
  ) THEN
    ALTER TABLE "AutomationRunError"
      ADD CONSTRAINT "AutomationRunError_runId_fkey"
      FOREIGN KEY ("runId")
      REFERENCES "AutomationRun"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AutomationStepExecution" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "executionKey" TEXT NOT NULL,
  "originalRunId" TEXT,
  "stepId" TEXT NOT NULL,
  "stepIndex" INTEGER NOT NULL,
  "stepType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationStepExecution_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AutomationStepExecution_runId_fkey'
  ) THEN
    ALTER TABLE "AutomationStepExecution"
      ADD CONSTRAINT "AutomationStepExecution_runId_fkey"
      FOREIGN KEY ("runId")
      REFERENCES "AutomationRun"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "AutomationStepExecution_executionKey_key"
  ON "AutomationStepExecution"("executionKey");

CREATE INDEX IF NOT EXISTS "AutomationRun_recoveryStatus_createdAt_idx"
  ON "AutomationRun"("recoveryStatus", "createdAt");

CREATE INDEX IF NOT EXISTS "AutomationRun_original_run_id_createdAt_idx"
  ON "AutomationRun"("original_run_id", "createdAt");

CREATE INDEX IF NOT EXISTS "AutomationRunError_runId_createdAt_idx"
  ON "AutomationRunError"("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationRunError_flowId_createdAt_idx"
  ON "AutomationRunError"("flowId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationRunError_userId_createdAt_idx"
  ON "AutomationRunError"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "AutomationStepExecution_runId_createdAt_idx"
  ON "AutomationStepExecution"("runId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationStepExecution_originalRunId_stepId_stepIndex_idx"
  ON "AutomationStepExecution"("originalRunId", "stepId", "stepIndex");
