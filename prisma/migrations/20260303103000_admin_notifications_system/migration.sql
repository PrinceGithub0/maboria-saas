DO $$
BEGIN
  CREATE TYPE "AdminNotificationType" AS ENUM (
    'SYSTEM',
    'AUTOMATION',
    'SLA',
    'SUPPORT',
    'SECURITY',
    'BILLING',
    'INCIDENT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AdminNotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AdminNotificationStatus" AS ENUM ('UNREAD', 'READ', 'ACKNOWLEDGED', 'RESOLVED', 'SNOOZED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AdminNotificationRecipientStrategy" AS ENUM (
    'ALL_ADMINS',
    'SUPER_ADMINS',
    'ASSIGNEE_ONLY',
    'ROLE',
    'CUSTOM_QUERY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AdminNotificationDedupeStrategy" AS ENUM (
    'BY_EVENT',
    'BY_TENANT',
    'BY_TENANT_AND_EVENT',
    'CUSTOM_KEY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AdminIncidentStatus" AS ENUM ('ACTIVE', 'RESOLVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "admin_notifications" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "recipient_admin_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" "AdminNotificationType" NOT NULL,
  "severity" "AdminNotificationSeverity" NOT NULL,
  "source_event_type" TEXT NOT NULL,
  "source_event_id" TEXT,
  "dedupe_key" TEXT NOT NULL,
  "occurrences" INTEGER NOT NULL DEFAULT 1,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "AdminNotificationStatus" NOT NULL DEFAULT 'UNREAD',
  "snoozed_until" TIMESTAMP(3),
  "acknowledged_at" TIMESTAMP(3),
  "acknowledged_by_admin_id" TEXT,
  "resolved_at" TIMESTAMP(3),
  "resolved_by_admin_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_notifications_recipient_admin_id_status_created_at_idx"
ON "admin_notifications"("recipient_admin_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "admin_notifications_recipient_admin_id_severity_created_at_idx"
ON "admin_notifications"("recipient_admin_id", "severity", "created_at");

CREATE INDEX IF NOT EXISTS "admin_notifications_dedupe_key_idx"
ON "admin_notifications"("dedupe_key");

CREATE INDEX IF NOT EXISTS "admin_notifications_last_seen_at_idx"
ON "admin_notifications"("last_seen_at");

CREATE INDEX IF NOT EXISTS "admin_notifications_status_snoozed_until_idx"
ON "admin_notifications"("status", "snoozed_until");

CREATE INDEX IF NOT EXISTS "admin_notifications_tenant_id_idx"
ON "admin_notifications"("tenant_id");

DO $$
BEGIN
  ALTER TABLE "admin_notifications"
    ADD CONSTRAINT "admin_notifications_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "Business"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "admin_notifications"
    ADD CONSTRAINT "admin_notifications_recipient_admin_id_fkey"
    FOREIGN KEY ("recipient_admin_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "admin_notifications"
    ADD CONSTRAINT "admin_notifications_acknowledged_by_admin_id_fkey"
    FOREIGN KEY ("acknowledged_by_admin_id") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "admin_notifications"
    ADD CONSTRAINT "admin_notifications_resolved_by_admin_id_fkey"
    FOREIGN KEY ("resolved_by_admin_id") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "admin_notification_audits" (
  "id" TEXT NOT NULL,
  "notification_id" TEXT NOT NULL,
  "actor_admin_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "from_status" "AdminNotificationStatus",
  "to_status" "AdminNotificationStatus",
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_notification_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_notification_audits_notification_id_created_at_idx"
ON "admin_notification_audits"("notification_id", "created_at");

DO $$
BEGIN
  ALTER TABLE "admin_notification_audits"
    ADD CONSTRAINT "admin_notification_audits_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "admin_notifications"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "admin_notification_audits"
    ADD CONSTRAINT "admin_notification_audits_actor_admin_id_fkey"
    FOREIGN KEY ("actor_admin_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "admin_notification_rules" (
  "id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "default_severity" "AdminNotificationSeverity" NOT NULL,
  "default_type" "AdminNotificationType" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "recipient_strategy" "AdminNotificationRecipientStrategy" NOT NULL,
  "role_key" TEXT,
  "dedupe_strategy" "AdminNotificationDedupeStrategy" NOT NULL,
  "dedupe_window_seconds" INTEGER NOT NULL DEFAULT 300,
  "template_title" TEXT NOT NULL,
  "template_message" TEXT NOT NULL,
  "metadata_template" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_notification_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_notification_rules_event_type_key"
ON "admin_notification_rules"("event_type");

CREATE INDEX IF NOT EXISTS "admin_notification_rules_event_type_enabled_idx"
ON "admin_notification_rules"("event_type", "enabled");

CREATE TABLE IF NOT EXISTS "admin_incidents" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "AdminIncidentStatus" NOT NULL DEFAULT 'ACTIVE',
  "severity" "AdminNotificationSeverity" NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "summary" TEXT,
  "created_by_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_incidents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_incidents_status_started_at_idx"
ON "admin_incidents"("status", "started_at");

DO $$
BEGIN
  ALTER TABLE "admin_incidents"
    ADD CONSTRAINT "admin_incidents_created_by_admin_id_fkey"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
