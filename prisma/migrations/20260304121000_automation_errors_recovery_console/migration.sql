-- Automation Errors recovery console hardening
-- Adds replay lineage + retry tracking and indexes for cursor filtering at scale

ALTER TABLE "AutomationRun"
ADD COLUMN IF NOT EXISTS "original_run_id" TEXT,
ADD COLUMN IF NOT EXISTS "last_retry_at" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AutomationRun_original_run_id_fkey'
  ) THEN
    ALTER TABLE "AutomationRun"
    ADD CONSTRAINT "AutomationRun_original_run_id_fkey"
    FOREIGN KEY ("original_run_id") REFERENCES "AutomationRun"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AutomationRun_createdAt_idx"
  ON "AutomationRun"("createdAt");
CREATE INDEX IF NOT EXISTS "AutomationRun_flowId_createdAt_idx"
  ON "AutomationRun"("flowId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationRun_userId_createdAt_idx"
  ON "AutomationRun"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationRun_runStatus_createdAt_idx"
  ON "AutomationRun"("runStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "AutomationRun_original_run_id_createdAt_idx"
  ON "AutomationRun"("original_run_id", "createdAt");
