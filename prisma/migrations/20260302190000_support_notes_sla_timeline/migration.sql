ALTER TABLE "support_tickets"
ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "support_internal_notes"
ADD COLUMN IF NOT EXISTS "tenant_id" TEXT,
ADD COLUMN IF NOT EXISTS "attachments" JSONB;

UPDATE "support_internal_notes" AS n
SET "tenant_id" = t."workspace_id"
FROM "support_tickets" AS t
WHERE n."ticket_id" = t."id"
  AND n."tenant_id" IS NULL;

ALTER TABLE "support_internal_notes"
ALTER COLUMN "tenant_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "support_internal_notes_tenant_id_created_at_idx"
ON "support_internal_notes"("tenant_id", "created_at");

DO $$
BEGIN
  CREATE TYPE "SupportSlaMetricStatus" AS ENUM ('RUNNING', 'PAUSED', 'MET', 'BREACHED', 'STOPPED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ticket_events" (
  "id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "actor_admin_id" TEXT,
  "event_type" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ticket_events_ticket_id_created_at_idx"
ON "ticket_events"("ticket_id", "created_at");

CREATE INDEX IF NOT EXISTS "ticket_events_tenant_id_created_at_idx"
ON "ticket_events"("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "ticket_events_event_type_created_at_idx"
ON "ticket_events"("event_type", "created_at");

DO $$
BEGIN
  ALTER TABLE "ticket_events"
    ADD CONSTRAINT "ticket_events_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "support_ticket_sla" (
  "id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "first_response_due_at" TIMESTAMP(3),
  "first_response_met_at" TIMESTAMP(3),
  "first_response_breached_at" TIMESTAMP(3),
  "first_response_status" "SupportSlaMetricStatus" NOT NULL DEFAULT 'RUNNING',
  "next_response_due_at" TIMESTAMP(3),
  "next_response_baseline_customer_message_at" TIMESTAMP(3),
  "next_response_met_at" TIMESTAMP(3),
  "next_response_breached_at" TIMESTAMP(3),
  "next_response_status" "SupportSlaMetricStatus" NOT NULL DEFAULT 'RUNNING',
  "resolution_due_at" TIMESTAMP(3),
  "resolution_met_at" TIMESTAMP(3),
  "resolution_breached_at" TIMESTAMP(3),
  "resolution_status" "SupportSlaMetricStatus" NOT NULL DEFAULT 'RUNNING',
  "next_response_paused_at" TIMESTAMP(3),
  "resolution_paused_at" TIMESTAMP(3),
  "total_paused_seconds" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_ticket_sla_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "support_ticket_sla_ticket_id_key"
ON "support_ticket_sla"("ticket_id");

CREATE INDEX IF NOT EXISTS "support_ticket_sla_tenant_id_updated_at_idx"
ON "support_ticket_sla"("tenant_id", "updated_at");

DO $$
BEGIN
  ALTER TABLE "support_ticket_sla"
    ADD CONSTRAINT "support_ticket_sla_ticket_id_fkey"
    FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "support_ticket_sla" (
  "id",
  "ticket_id",
  "tenant_id",
  "first_response_due_at",
  "next_response_due_at",
  "next_response_baseline_customer_message_at",
  "resolution_due_at"
)
SELECT
  concat('sla_', t."id"),
  t."id",
  t."workspace_id",
  t."created_at" + CASE
    WHEN t."priority" = 'LOW' THEN interval '24 hours'
    WHEN t."priority" = 'HIGH' THEN interval '2 hours'
    WHEN t."priority" = 'URGENT' THEN interval '1 hour'
    ELSE interval '8 hours'
  END,
  t."created_at" + CASE
    WHEN t."priority" = 'LOW' THEN interval '12 hours'
    WHEN t."priority" = 'HIGH' THEN interval '1 hour'
    WHEN t."priority" = 'URGENT' THEN interval '30 minutes'
    ELSE interval '4 hours'
  END,
  t."created_at",
  t."created_at" + CASE
    WHEN t."priority" = 'LOW' THEN interval '72 hours'
    WHEN t."priority" = 'HIGH' THEN interval '12 hours'
    WHEN t."priority" = 'URGENT' THEN interval '4 hours'
    ELSE interval '24 hours'
  END
FROM "support_tickets" AS t
WHERE NOT EXISTS (
  SELECT 1 FROM "support_ticket_sla" s WHERE s."ticket_id" = t."id"
);
