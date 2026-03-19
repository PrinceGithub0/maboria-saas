CREATE INDEX IF NOT EXISTS "user_activity_logs_user_id_created_at_id_idx"
ON "user_activity_logs"("user_id", "created_at" DESC, "id" DESC);
