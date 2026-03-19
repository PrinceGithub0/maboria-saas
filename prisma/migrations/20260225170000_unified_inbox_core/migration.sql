-- Create enums for unified inbox core
CREATE TYPE "UnifiedInboxType" AS ENUM ('EMAIL', 'WHATSAPP');
CREATE TYPE "UnifiedInboxStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR', 'DISABLED');
CREATE TYPE "UnifiedConversationStatus" AS ENUM ('OPEN', 'PENDING', 'CLOSED');
CREATE TYPE "UnifiedMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL', 'SYSTEM');
CREATE TYPE "UnifiedMessageChannel" AS ENUM ('EMAIL', 'WHATSAPP');
CREATE TYPE "UnifiedDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateTable
CREATE TABLE "inboxes" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "type" "UnifiedInboxType" NOT NULL,
  "name" TEXT NOT NULL,
  "status" "UnifiedInboxStatus" NOT NULL DEFAULT 'ACTIVE',
  "credentialsEncrypted" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "inboxId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" "UnifiedConversationStatus" NOT NULL DEFAULT 'OPEN',
  "assignedUserId" TEXT,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "inboxId" TEXT NOT NULL,
  "direction" "UnifiedMessageDirection" NOT NULL,
  "channel" "UnifiedMessageChannel" NOT NULL,
  "externalId" TEXT,
  "senderIdentifier" TEXT,
  "content" TEXT NOT NULL,
  "attachments" JSONB,
  "deliveryStatus" "UnifiedDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_tags" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actionType" TEXT NOT NULL,
  "conversationId" TEXT,
  "messageId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "billingPeriod" TEXT NOT NULL,
  "emailMessagesSent" INTEGER NOT NULL DEFAULT 0,
  "whatsappMessagesSent" INTEGER NOT NULL DEFAULT 0,
  "totalMessagesSent" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "inboxes_tenantId_type_key" ON "inboxes"("tenantId", "type");
CREATE INDEX "inboxes_tenantId_status_idx" ON "inboxes"("tenantId", "status");

CREATE INDEX "conversations_tenantId_status_lastMessageAt_idx" ON "conversations"("tenantId", "status", "lastMessageAt");
CREATE INDEX "conversations_assignedUserId_idx" ON "conversations"("assignedUserId");
CREATE INDEX "conversations_contactId_idx" ON "conversations"("contactId");

CREATE UNIQUE INDEX "messages_externalId_inboxId_key" ON "messages"("externalId", "inboxId");
CREATE INDEX "messages_tenantId_createdAt_idx" ON "messages"("tenantId", "createdAt");
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

CREATE INDEX "notes_tenantId_createdAt_idx" ON "notes"("tenantId", "createdAt");
CREATE INDEX "notes_conversationId_createdAt_idx" ON "notes"("conversationId", "createdAt");

CREATE UNIQUE INDEX "tags_tenantId_label_key" ON "tags"("tenantId", "label");
CREATE INDEX "tags_tenantId_idx" ON "tags"("tenantId");

CREATE UNIQUE INDEX "conversation_tags_conversationId_tagId_key" ON "conversation_tags"("conversationId", "tagId");
CREATE INDEX "conversation_tags_tenantId_createdAt_idx" ON "conversation_tags"("tenantId", "createdAt");

CREATE INDEX "audit_events_tenantId_createdAt_idx" ON "audit_events"("tenantId", "createdAt");
CREATE INDEX "audit_events_conversationId_createdAt_idx" ON "audit_events"("conversationId", "createdAt");

CREATE UNIQUE INDEX "usage_counters_tenantId_billingPeriod_key" ON "usage_counters"("tenantId", "billingPeriod");
CREATE INDEX "usage_counters_tenantId_updatedAt_idx" ON "usage_counters"("tenantId", "updatedAt");

-- Foreign keys
ALTER TABLE "inboxes"
  ADD CONSTRAINT "inboxes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_inboxId_fkey"
  FOREIGN KEY ("inboxId") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_inboxId_fkey"
  FOREIGN KEY ("inboxId") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notes"
  ADD CONSTRAINT "notes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes"
  ADD CONSTRAINT "notes_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes"
  ADD CONSTRAINT "notes_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tags"
  ADD CONSTRAINT "tags_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_tags"
  ADD CONSTRAINT "conversation_tags_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_tags"
  ADD CONSTRAINT "conversation_tags_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_tags"
  ADD CONSTRAINT "conversation_tags_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "usage_counters"
  ADD CONSTRAINT "usage_counters_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
