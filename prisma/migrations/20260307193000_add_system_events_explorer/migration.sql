CREATE TYPE "SystemEventSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "SystemEventSource" AS ENUM ('BILLING', 'AUTH', 'AUTOMATION', 'INBOX', 'SUPPORT', 'SYSTEM');

CREATE TABLE "system_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "user_id" TEXT,
  "actor_id" TEXT,
  "event_type" TEXT NOT NULL,
  "severity" "SystemEventSeverity" NOT NULL DEFAULT 'INFO',
  "source" "SystemEventSource" NOT NULL,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "message" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "request_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "system_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "system_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "system_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "index_system_events_created" ON "system_events" ("created_at" DESC, "id" DESC);
CREATE INDEX "index_system_events_tenant_created" ON "system_events" ("tenant_id", "created_at" DESC, "id" DESC);
CREATE INDEX "index_system_events_event_type_created" ON "system_events" ("event_type", "created_at" DESC, "id" DESC);
CREATE INDEX "index_system_events_severity_created" ON "system_events" ("severity", "created_at" DESC, "id" DESC);
CREATE INDEX "index_system_events_entity_id" ON "system_events" ("entity_id");
CREATE INDEX "index_system_events_request_id" ON "system_events" ("request_id");
