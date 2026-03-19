CREATE TABLE IF NOT EXISTS "user_activity_logs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "actor_id" TEXT,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "index_user_activity_user" ON "user_activity_logs"("user_id");
CREATE INDEX IF NOT EXISTS "index_user_activity_tenant" ON "user_activity_logs"("tenant_id");
CREATE INDEX IF NOT EXISTS "index_user_activity_created" ON "user_activity_logs"("created_at");
CREATE INDEX IF NOT EXISTS "user_activity_logs_user_id_created_at_idx" ON "user_activity_logs"("user_id", "created_at");

DO $$
BEGIN
  ALTER TABLE "user_activity_logs"
    ADD CONSTRAINT "user_activity_logs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "Business"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "user_activity_logs"
    ADD CONSTRAINT "user_activity_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "user_activity_logs"
    ADD CONSTRAINT "user_activity_logs_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
