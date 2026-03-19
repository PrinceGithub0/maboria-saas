-- Add support message channel tracking
CREATE TYPE "SupportMessageChannel" AS ENUM ('APP', 'EMAIL', 'SYSTEM');

ALTER TABLE "support_messages"
ADD COLUMN "channel" "SupportMessageChannel" NOT NULL DEFAULT 'APP';

-- Connected mailbox foundation for subscriber-to-customer email
CREATE TYPE "ConnectedMailboxProvider" AS ENUM ('GMAIL', 'OUTLOOK', 'IMAP', 'SMTP');
CREATE TYPE "ConnectedMailboxStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISCONNECTED', 'ERROR');
CREATE TYPE "CustomerMailboxConversationStatus" AS ENUM ('OPEN', 'PENDING', 'CLOSED');
CREATE TYPE "CustomerMailboxChannelType" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS');
CREATE TYPE "CustomerMailboxSenderType" AS ENUM ('SUBSCRIBER', 'CUSTOMER', 'SYSTEM');

CREATE TABLE "connected_mailboxes" (
  "id" TEXT NOT NULL,
  "subscriber_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "provider" "ConnectedMailboxProvider" NOT NULL,
  "status" "ConnectedMailboxStatus" NOT NULL DEFAULT 'PENDING',
  "email_address" TEXT NOT NULL,
  "display_name" TEXT,
  "provider_account_id" TEXT,
  "credentials_encrypted" TEXT,
  "access_token_encrypted" TEXT,
  "refresh_token_encrypted" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "connected_mailboxes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_conversations" (
  "id" TEXT NOT NULL,
  "subscriber_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "connected_mailbox_id" TEXT,
  "customer_id" TEXT,
  "customer_email" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "channel_type" "CustomerMailboxChannelType" NOT NULL DEFAULT 'EMAIL',
  "status" "CustomerMailboxConversationStatus" NOT NULL DEFAULT 'OPEN',
  "external_thread_id" TEXT,
  "last_message_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_messages" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "subscriber_id" TEXT,
  "workspace_id" TEXT NOT NULL,
  "connected_mailbox_id" TEXT,
  "sender_type" "CustomerMailboxSenderType" NOT NULL,
  "sender_email" TEXT,
  "channel" "CustomerMailboxChannelType" NOT NULL DEFAULT 'EMAIL',
  "subject" TEXT,
  "text_body" TEXT NOT NULL,
  "html_body" TEXT,
  "attachments_json" JSONB,
  "external_message_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "connected_mailboxes_workspace_id_email_address_key"
ON "connected_mailboxes"("workspace_id", "email_address");

CREATE INDEX "connected_mailboxes_subscriber_id_status_created_at_idx"
ON "connected_mailboxes"("subscriber_id", "status", "created_at");

CREATE INDEX "connected_mailboxes_workspace_id_provider_status_idx"
ON "connected_mailboxes"("workspace_id", "provider", "status");

CREATE INDEX "customer_conversations_subscriber_id_status_last_message_at_idx"
ON "customer_conversations"("subscriber_id", "status", "last_message_at");

CREATE INDEX "customer_conversations_workspace_id_channel_type_status_idx"
ON "customer_conversations"("workspace_id", "channel_type", "status");

CREATE INDEX "customer_conversations_connected_mailbox_id_last_message_at_idx"
ON "customer_conversations"("connected_mailbox_id", "last_message_at");

CREATE INDEX "customer_conversations_customer_id_idx"
ON "customer_conversations"("customer_id");

CREATE INDEX "customer_messages_conversation_id_created_at_idx"
ON "customer_messages"("conversation_id", "created_at");

CREATE INDEX "customer_messages_workspace_id_channel_created_at_idx"
ON "customer_messages"("workspace_id", "channel", "created_at");

CREATE INDEX "customer_messages_connected_mailbox_id_created_at_idx"
ON "customer_messages"("connected_mailbox_id", "created_at");

CREATE UNIQUE INDEX "customer_messages_connected_mailbox_id_external_message_id_key"
ON "customer_messages"("connected_mailbox_id", "external_message_id");

ALTER TABLE "connected_mailboxes"
ADD CONSTRAINT "connected_mailboxes_subscriber_id_fkey"
FOREIGN KEY ("subscriber_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "connected_mailboxes"
ADD CONSTRAINT "connected_mailboxes_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_conversations"
ADD CONSTRAINT "customer_conversations_subscriber_id_fkey"
FOREIGN KEY ("subscriber_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_conversations"
ADD CONSTRAINT "customer_conversations_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_conversations"
ADD CONSTRAINT "customer_conversations_connected_mailbox_id_fkey"
FOREIGN KEY ("connected_mailbox_id") REFERENCES "connected_mailboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_conversations"
ADD CONSTRAINT "customer_conversations_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_messages"
ADD CONSTRAINT "customer_messages_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "customer_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_messages"
ADD CONSTRAINT "customer_messages_subscriber_id_fkey"
FOREIGN KEY ("subscriber_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_messages"
ADD CONSTRAINT "customer_messages_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_messages"
ADD CONSTRAINT "customer_messages_connected_mailbox_id_fkey"
FOREIGN KEY ("connected_mailbox_id") REFERENCES "connected_mailboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
