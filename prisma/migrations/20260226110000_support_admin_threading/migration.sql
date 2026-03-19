-- Create enums for admin support threading
CREATE TYPE "SupportThreadStatus" AS ENUM ('OPEN', 'PENDING', 'CLOSED');
CREATE TYPE "SupportThreadPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "SupportSenderType" AS ENUM ('SUBSCRIBER', 'ADMIN', 'SYSTEM');
CREATE TYPE "SupportDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- Create support tickets table
CREATE TABLE "support_tickets" (
  "id" TEXT NOT NULL,
  "subscriber_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" "SupportThreadStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "SupportThreadPriority" NOT NULL DEFAULT 'NORMAL',
  "assigned_admin_id" TEXT,
  "first_response_at" TIMESTAMP(3),
  "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "subscriber_unread_count" INTEGER NOT NULL DEFAULT 0,
  "admin_unread_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- Create support messages table
CREATE TABLE "support_messages" (
  "id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "sender_type" "SupportSenderType" NOT NULL,
  "sender_id" TEXT,
  "content" TEXT NOT NULL,
  "attachments" JSONB,
  "message_id_header" TEXT,
  "in_reply_to_header" TEXT,
  "references_header" TEXT,
  "delivery_status" "SupportDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- Create support internal notes table
CREATE TABLE "support_internal_notes" (
  "id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "admin_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_internal_notes_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "support_tickets_workspace_id_status_last_activity_at_idx"
  ON "support_tickets"("workspace_id", "status", "last_activity_at");
CREATE INDEX "support_tickets_assigned_admin_id_status_last_activity_at_idx"
  ON "support_tickets"("assigned_admin_id", "status", "last_activity_at");
CREATE INDEX "support_tickets_subscriber_id_last_activity_at_idx"
  ON "support_tickets"("subscriber_id", "last_activity_at");
CREATE INDEX "support_messages_ticket_id_created_at_idx"
  ON "support_messages"("ticket_id", "created_at");
CREATE INDEX "support_messages_message_id_header_idx"
  ON "support_messages"("message_id_header");
CREATE INDEX "support_internal_notes_ticket_id_created_at_idx"
  ON "support_internal_notes"("ticket_id", "created_at");

-- Foreign keys
ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_subscriber_id_fkey"
  FOREIGN KEY ("subscriber_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_assigned_admin_id_fkey"
  FOREIGN KEY ("assigned_admin_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_messages"
  ADD CONSTRAINT "support_messages_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_messages"
  ADD CONSTRAINT "support_messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_internal_notes"
  ADD CONSTRAINT "support_internal_notes_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_internal_notes"
  ADD CONSTRAINT "support_internal_notes_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: move legacy support tickets into new support_tickets
WITH owner_workspace AS (
  SELECT DISTINCT ON (b."ownerId")
    b."ownerId" AS user_id,
    b.id AS workspace_id
  FROM "Business" b
  ORDER BY b."ownerId", b."createdAt" ASC
),
member_workspace AS (
  SELECT DISTINCT ON (m."userId")
    m."userId" AS user_id,
    m."businessId" AS workspace_id
  FROM "BusinessMember" m
  WHERE LOWER(COALESCE(m.status, '')) = 'active'
  ORDER BY m."userId", m."createdAt" ASC
),
workspace_resolve AS (
  SELECT
    st.id,
    COALESCE(mw.workspace_id, ow.workspace_id) AS workspace_id
  FROM "SupportTicket" st
  LEFT JOIN member_workspace mw ON mw.user_id = st."userId"
  LEFT JOIN owner_workspace ow ON ow.user_id = st."userId"
)
INSERT INTO "support_tickets" (
  "id",
  "subscriber_id",
  "workspace_id",
  "subject",
  "status",
  "priority",
  "last_activity_at",
  "subscriber_unread_count",
  "admin_unread_count",
  "created_at",
  "updated_at"
)
SELECT
  st.id,
  st."userId" AS subscriber_id,
  wr.workspace_id,
  st.title AS subject,
  CASE
    WHEN st.status::TEXT = 'CLOSED' THEN 'CLOSED'::"SupportThreadStatus"
    WHEN st.status::TEXT = 'RESOLVED' THEN 'CLOSED'::"SupportThreadStatus"
    WHEN st.status::TEXT = 'IN_PROGRESS' THEN 'PENDING'::"SupportThreadStatus"
    ELSE 'OPEN'::"SupportThreadStatus"
  END AS status,
  CASE LOWER(COALESCE(st.priority, 'normal'))
    WHEN 'low' THEN 'LOW'::"SupportThreadPriority"
    WHEN 'high' THEN 'HIGH'::"SupportThreadPriority"
    WHEN 'critical' THEN 'URGENT'::"SupportThreadPriority"
    WHEN 'urgent' THEN 'URGENT'::"SupportThreadPriority"
    ELSE 'NORMAL'::"SupportThreadPriority"
  END AS priority,
  COALESCE(
    (
      SELECT MAX(tm."createdAt")
      FROM "TicketMessage" tm
      WHERE tm."ticketId" = st.id
    ),
    st."createdAt"
  ) AS last_activity_at,
  0,
  0,
  st."createdAt" AS created_at,
  COALESCE(
    (
      SELECT MAX(tm."createdAt")
      FROM "TicketMessage" tm
      WHERE tm."ticketId" = st.id
    ),
    st."createdAt"
  ) AS updated_at
FROM "SupportTicket" st
JOIN workspace_resolve wr ON wr.id = st.id
WHERE wr.workspace_id IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- Backfill: initial subscriber message from legacy SupportTicket.message
INSERT INTO "support_messages" (
  "id",
  "ticket_id",
  "sender_type",
  "sender_id",
  "content",
  "attachments",
  "delivery_status",
  "created_at"
)
SELECT
  CONCAT('legacy-init-', st.id) AS id,
  st.id AS ticket_id,
  'SUBSCRIBER'::"SupportSenderType" AS sender_type,
  st."userId" AS sender_id,
  st.message AS content,
  st.attachments,
  'DELIVERED'::"SupportDeliveryStatus" AS delivery_status,
  st."createdAt" AS created_at
FROM "SupportTicket" st
JOIN "support_tickets" nt ON nt.id = st.id
ON CONFLICT ("id") DO NOTHING;

-- Backfill: legacy ticket replies
INSERT INTO "support_messages" (
  "id",
  "ticket_id",
  "sender_type",
  "sender_id",
  "content",
  "delivery_status",
  "created_at"
)
SELECT
  CONCAT('legacy-reply-', tm.id) AS id,
  tm."ticketId" AS ticket_id,
  CASE
    WHEN tm."userId" = st."userId" THEN 'SUBSCRIBER'::"SupportSenderType"
    ELSE 'ADMIN'::"SupportSenderType"
  END AS sender_type,
  tm."userId" AS sender_id,
  tm.body AS content,
  'DELIVERED'::"SupportDeliveryStatus" AS delivery_status,
  tm."createdAt" AS created_at
FROM "TicketMessage" tm
JOIN "SupportTicket" st ON st.id = tm."ticketId"
JOIN "support_tickets" nt ON nt.id = tm."ticketId"
ON CONFLICT ("id") DO NOTHING;

-- Backfill first response timestamp based on first admin message
UPDATE "support_tickets" st
SET "first_response_at" = first_admin.first_response_at
FROM (
  SELECT
    sm.ticket_id,
    MIN(sm.created_at) AS first_response_at
  FROM "support_messages" sm
  WHERE sm.sender_type = 'ADMIN'
  GROUP BY sm.ticket_id
) first_admin
WHERE st.id = first_admin.ticket_id;
