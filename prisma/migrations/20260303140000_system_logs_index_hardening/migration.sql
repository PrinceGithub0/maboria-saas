-- System logs query scale hardening
-- Adds indexes used by /api/admin/logs and /api/admin/logs/export

CREATE INDEX IF NOT EXISTS "ActivityLog_timestamp_idx" ON "ActivityLog"("timestamp");
CREATE INDEX IF NOT EXISTS "ActivityLog_userId_timestamp_idx" ON "ActivityLog"("userId", "timestamp");

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt");
CREATE INDEX IF NOT EXISTS "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");
CREATE INDEX IF NOT EXISTS "WebhookEvent_eventId_idx" ON "WebhookEvent"("eventId");

